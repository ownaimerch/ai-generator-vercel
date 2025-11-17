// api/shopify-order-webhook.js
import crypto from "crypto";

export const config = {
  api: {
    bodyParser: false, // potrzebujemy surowego body do weryfikacji HMAC
  },
};

async function readRawBody(req) {
  const chunks = [];
  for await (const chunk of req) {
    chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
  }
  return Buffer.concat(chunks);
}

export default async function handler(req, res) {
  // Tylko POST z webhooka
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const rawBody = await readRawBody(req);

  // --- 1. Weryfikacja HMAC z Shopify ---

  const hmacHeader =
    req.headers["x-shopify-hmac-sha256"] ||
    req.headers["X-Shopify-Hmac-Sha256"];
  const secret = process.env.SHOPIFY_WEBHOOK_SECRET;

  if (!secret) {
    console.error("❌ SHOPIFY_WEBHOOK_SECRET not set");
    return res.status(500).json({ error: "Missing webhook secret" });
  }

  const digest = crypto
    .createHmac("sha256", secret)
    .update(rawBody)
    .digest("base64");

  if (digest !== hmacHeader) {
    console.error("❌ Invalid Shopify HMAC");
    return res.status(401).json({ error: "Invalid signature" });
  }

  // --- 2. Parsowanie payloadu zamówienia ---

  let payload;
  try {
    payload = JSON.parse(rawBody.toString("utf8"));
  } catch (err) {
    console.error("❌ Cannot parse Shopify payload", err);
    return res.status(400).json({ error: "Invalid JSON" });
  }

  const shippingAddress = payload.shipping_address || {};
  const email = payload.email || "";
  const phone = payload.phone || "";

  // zbuduj obiekt shipping zgodny z /api/create-printify-order
  const shipping = {
    first_name: shippingAddress.first_name || "",
    last_name: shippingAddress.last_name || "",
    email,
    phone: shippingAddress.phone || phone || "",
    country: shippingAddress.country_code || shippingAddress.country || "",
    region: shippingAddress.province || "",
    address1: shippingAddress.address1 || "",
    address2: shippingAddress.address2 || "",
    city: shippingAddress.city || "",
    zip: shippingAddress.zip || "",
  };

  const lineItems = payload.line_items || [];
  const tasks = [];

  for (const item of lineItems) {
    const props = item.properties || [];

    // Szukamy naszych własnych właściwości
    const aiBase64Prop = props.find((p) => p.name === "ai_base64");
    if (!aiBase64Prop || !aiBase64Prop.value) {
      // zwykły produkt, nie AI – pomijamy
      continue;
    }

    const aiPromptProp = props.find((p) => p.name === "ai_prompt");
    const base64 = aiBase64Prop.value;
    const prompt = aiPromptProp?.value || "";

    const externalId = `shopify-${payload.id}-${item.id}`;

    const body = {
      base64,
      prompt,
      shipping,
      external_id: externalId,
      // jeśli będziesz chciał – tu możesz kiedyś przepisać variant_id z Shopify na Printify
    };

    // wołamy NASZ istniejący endpoint na Vercel
    tasks.push(
      fetch("https://app.ownaimerch.com/api/create-printify-order", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })
    );
  }

  // odpal wszystko równolegle
  await Promise.all(tasks);

  return res.status(200).json({
    ok: true,
    handled_items: tasks.length,
    shopify_order_id: payload.id,
  });
}
