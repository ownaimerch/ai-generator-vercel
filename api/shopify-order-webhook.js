// api/shopify-order-webhook.js
import { createClient } from "@supabase/supabase-js";
import crypto from "crypto";

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const shopifySecret = process.env.b9ca96da492a7c0de200e522bf198deb7ae11c20b8ced21515c84a0000e6d97c || "";

const supabase = createClient(supabaseUrl, supabaseKey);

// Ile kredytów dają konkretne pakiety
const PACK_CREDITS = {
  "Mini Design": 2,
  "Mini Clean Logo": 3,
  Starter: 20,
  Creator: 80,
  "Pro / Studio": 250,
};

function verifyShopifyHmac(req, rawBody) {
  if (!shopifySecret) return true; // jak nie ma secreta, nie blokujemy (dev)
  const hmacHeader = req.headers["x-shopify-hmac-sha256"];
  if (!hmacHeader) return false;

  const digest = crypto
    .createHmac("sha256", shopifySecret)
    .update(rawBody, "utf8")
    .digest("base64");

  return crypto.timingSafeEqual(
    Buffer.from(digest, "utf8"),
    Buffer.from(hmacHeader, "utf8")
  );
}

export const config = {
  api: {
    bodyParser: false, // sami parsujemy JSON żeby mieć surowe body do HMAC
  },
};

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).send("Method not allowed");
  }

  // 1) wczytujemy raw body
  let rawBody = "";
  req.on("data", (chunk) => {
    rawBody += chunk;
  });

  req.on("end", async () => {
    try {
      // 2) weryfikacja HMAC (opcjonalnie w dev)
      if (!verifyShopifyHmac(req, rawBody)) {
        console.error("❌ Shopify webhook HMAC verification failed");
        return res.status(401).send("Invalid HMAC");
      }

      const order = JSON.parse(rawBody || "{}");
      console.log("🧾 [AI credits] incoming order", order.id);

      if (!order || !order.id) {
        return res.status(400).json({ error: "No order payload" });
      }

      // 3) tylko opłacone zamówienia
      const financialStatus = order.financial_status || order.payment_status;
      if (financialStatus !== "paid") {
        console.log(
          "[AI credits] order not paid yet, status=",
          financialStatus
        );
        return res
          .status(200)
          .json({ ok: true, skipped: "not_paid", status: financialStatus });
      }

      if (!order.customer || !order.customer.id) {
        console.log("[AI credits] order has no customer, skipping");
        return res
          .status(200)
          .json({ ok: true, skipped: "no_customer", orderId: order.id });
      }

      const userId = order.customer.id;
      const email = order.email || order.customer.email || null;

      // 4) zliczamy kredyty z line_items
      let totalCreditsToAdd = 0;

      for (const item of order.line_items || []) {
        let packName = null;

        // szukamy properties[_ai_credits_pack]
        if (Array.isArray(item.properties) && item.properties.length > 0) {
          const p = item.properties.find(
            (prop) => prop && prop.name === "_ai_credits_pack"
          );
          if (p && p.value) {
            packName = p.value.trim();
          }
        }

        // fallback na tytuł produktu
        if (!packName) {
          packName = (item.title || "").trim();
        }

        const perUnit = PACK_CREDITS[packName];
        if (!perUnit) continue;

        const qty = item.quantity || 1;
        totalCreditsToAdd += perUnit * qty;
      }

      if (!totalCreditsToAdd) {
        console.log("[AI credits] no AI credit packs on order", order.id);
        return res
          .status(200)
          .json({ ok: true, skipped: "no_packs", orderId: order.id });
      }

      console.log(
        `[AI credits] adding ${totalCreditsToAdd} credits for user ${userId}`
      );

      // 5) pobieramy aktualne kredyty
      const { data: existing, error: selectErr } = await supabase
        .from("ai_users")
        .select("credits")
        .eq("id", userId)
        .maybeSingle();

      if (selectErr && selectErr.code !== "PGRST116") {
        console.error("❌ ai_users select error", selectErr);
        return res.status(500).json({ error: "db_select_error" });
      }

      const currentCredits = existing?.credits ?? 0;
      const newCredits = currentCredits + totalCreditsToAdd;

      // 6) upsert użytkownika z nową liczbą kredytów
      const { error: upsertErr } = await supabase.from("ai_users").upsert(
        {
          id: userId,
          email,
          credits: newCredits,
        },
        { onConflict: "id" }
      );

      if (upsertErr) {
        console.error("❌ ai_users upsert error", upsertErr);
        return res.status(500).json({ error: "db_upsert_error" });
      }

      // 7) log do ai_usage (opcjonalne)
      await supabase.from("ai_usage").insert({
        user_id: userId,
        type: "pack_purchase",
        prompt: `Order ${order.name || order.id}`,
        cost: -totalCreditsToAdd, // ujemny -> dodaliśmy tyle kredytów
      });

      console.log(
        `[AI credits] credits updated -> ${newCredits} for user ${userId}`
      );

      return res
        .status(200)
        .json({ ok: true, userId, added: totalCreditsToAdd, credits: newCredits });
    } catch (err) {
      console.error("❌ shopify-order-webhook error", err);
      return res
        .status(500)
        .json({ error: err?.message || "Unknown webhook error" });
    }
  });
}
