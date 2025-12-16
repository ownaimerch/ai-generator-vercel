// api/shopify-credits-webhook.js
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.warn("⚠️ Supabase env vars missing (SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY)");
}

const supabase =
  supabaseUrl && supabaseServiceKey
    ? createClient(supabaseUrl, supabaseServiceKey)
    : null;

// MAPA: variant_id -> ile kredytów dodajemy
// ❗ PODMIEŃ NA SWOJE RZECZYWISTE ID WARIANTÓW
const CREDIT_PACKS = {
  // MINI
  12345678901234: { credits: 10, code: "MINI_10" },
  // STARTER
  23456789012345: { credits: 30, code: "STARTER_30" },
  // PRO
  34567890123456: { credits: 80, code: "PRO_80" },
};

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).send("Method not allowed");
  }

  if (!supabase) {
    console.error("Supabase client not configured");
    return res.status(500).json({ error: "Supabase not configured" });
  }

  let order;
  try {
    order = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
  } catch (e) {
    console.error("Invalid JSON in webhook body", e);
    return res.status(400).json({ error: "Invalid JSON" });
  }

  if (!order || !order.id) {
    return res.status(200).json({ ok: true, skip: "no order" });
  }

  // kredyty tylko po opłaceniu
  if (order.financial_status && order.financial_status !== "paid") {
    return res.status(200).json({ ok: true, skip: "order not paid" });
  }

  const customer = order.customer;
  if (!customer || !customer.id || !customer.email) {
    console.warn("Order without proper customer info", order.id);
    return res.status(200).json({ ok: true, skip: "no customer" });
  }

  const customerId = customer.id;
  const email = customer.email;

  let totalCredits = 0;
  const details = [];

  (order.line_items || []).forEach((item) => {
    const vId = item.variant_id;
    const qty = item.quantity || 1;

    const pack = CREDIT_PACKS[vId];
    if (!pack) return;

    const creditsForLine = pack.credits * qty;
    totalCredits += creditsForLine;

    details.push({
      variant_id: vId,
      qty,
      credits: creditsForLine,
      pack_code: pack.code,
      title: item.title,
    });
  });

  if (!totalCredits) {
    return res.status(200).json({ ok: true, skip: "no credit packs in order" });
  }

  try {
    // 1) pobieramy aktualnego usera
    const { data: rows, error: userErr } = await supabase
      .from("ai_users")
      .select("*")
      .eq("id", customerId)
      .limit(1);

    if (userErr) {
      console.error("Supabase select error:", userErr);
      // nie wywalaj webhooka – ale nie dodawaj kredytów
      return res.status(500).json({ error: "Supabase select error" });
    }

    const user = rows && rows[0];
    const currentCredits = user && typeof user.credits === "number" ? user.credits : 0;
    const newCredits = currentCredits + totalCredits;

    if (user) {
      // UPDATE istniejącego
      const { error: updErr } = await supabase
        .from("ai_users")
        .update({
          email,
          credits: newCredits,
          updated_at: new Date().toISOString(),
        })
        .eq("id", customerId);

      if (updErr) {
        console.error("Supabase update error:", updErr);
        return res.status(500).json({ error: "Supabase update error" });
      }
    } else {
      // INSERT nowego
      const { error: insErr } = await supabase.from("ai_users").insert({
        id: customerId,
        email,
        credits: newCredits,
      });

      if (insErr) {
        console.error("Supabase insert error:", insErr);
        return res.status(500).json({ error: "Supabase insert error" });
      }
    }

    // 2) log do ai_usage (typu 'pack_purchase')
    const usagePayload = {
      user_id: customerId,
      type: "pack_purchase",
      prompt: JSON.stringify({
        order_id: order.id,
        credits_added: totalCredits,
        packs: details,
      }),
      cost: totalCredits, // tu traktujemy jako "kredyty dodane"
    };

    const { error: logErr } = await supabase
      .from("ai_usage")
      .insert(usagePayload);

    if (logErr) {
      console.warn("Supabase usage insert error (non-fatal):", logErr);
      // nie blokujemy z tego powodu – kredyty już dodane
    }

    return res.status(200).json({
      ok: true,
      order_id: order.id,
      customer_id: customerId,
      credits_added: totalCredits,
      credits_total: newCredits,
    });
  } catch (e) {
    console.error("Webhook processing error:", e);
    return res.status(500).json({ error: "Webhook processing error" });
  }
}
