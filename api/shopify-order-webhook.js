// api/shopify-order-webhook.js

const PRINTIFY_API_KEY = process.env.PRINTIFY_API_KEY;
const PRINTIFY_SHOP_ID = process.env.PRINTIFY_SHOP_ID;

// Możesz później przenieść to do env,
// na razie zostawiamy „na sztywno” – to wartości z Twoich testów
const PRINT_PROVIDER_ID = Number(process.env.PRINTIFY_PROVIDER_ID || "99");
const BLUEPRINT_ID = Number(process.env.PRINTIFY_BLUEPRINT_ID || "706");
const VARIANT_ID = Number(process.env.PRINTIFY_VARIANT_ID || "79153");

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).send("Method not allowed");
  }

  if (!PRINTIFY_API_KEY || !PRINTIFY_SHOP_ID) {
    console.error("Missing PRINTIFY_API_KEY or PRINTIFY_SHOP_ID env vars");
    return res.status(500).json({
      error: "Server misconfigured",
    });
  }

  let order = req.body;
  if (!order || typeof order !== "object") {
    try {
      order = JSON.parse(req.body);
    } catch {
      console.error("Cannot parse Shopify webhook body");
      return res.status(400).json({ error: "Invalid JSON" });
    }
  }

  console.log("📦 Shopify order webhook:", JSON.stringify(order, null, 2));

  const aiLineItems = [];

  for (const item of order.line_items || []) {
    const props = {};
    for (const p of item.properties || []) {
      if (p.name && p.value) props[p.name] = p.value;
    }

    // interesują nas tylko te, które mają nasze pola
    if (!props.ai_id || !props.ai_image_url) continue;

    aiLineItems.push({
      print_provider_id: PRINT_PROVIDER_ID,
      blueprint_id: BLUEPRINT_ID,
      variant_id: VARIANT_ID,
      quantity: item.quantity || 1,
      external_id: props.ai_id,
      print_areas: {
        front: [
          {
            src: props.ai_image_url,
            scale: 0.55,
            x: 0.5,
            y: 0.42,
            angle: 0,
          },
        ],
      },
    });
  }

  if (!aiLineItems.length) {
    console.log("No AI items in this order – nothing to send to Printify.");
    return res.status(200).json({ ok: true, message: "No AI items" });
  }

  const shipping = order.shipping_address || {};
  const customer = order.customer || {};

  const address_to = {
    first_name: shipping.first_name || customer.first_name || "AI",
    last_name: shipping.last_name || customer.last_name || "Customer",
    email: order.email || customer.email || "test@example.com",
    phone: shipping.phone || customer.phone || "000000000",
    country: shipping.country_code || shipping.country || "US",
    region: shipping.province_code || shipping.province || "",
    address1: shipping.address1 || "",
    address2: shipping.address2 || "",
    city: shipping.city || "",
    zip: shipping.zip || "",
  };

  const printifyOrderBody = {
    external_id: `shopify-${order.id || order.name || Date.now()}`,
    label: order.name || `Shopify order ${order.id || ""}`,
    line_items: aiLineItems,
    shipping_method: 1,
    is_printify_express: false,
    is_economy_shipping: false,
    send_shipping_notification: false,
    address_to,
  };

  try {
    const resp = await fetch(
      `https://api.printify.com/v1/shops/${PRINTIFY_SHOP_ID}/orders.json`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${PRINTIFY_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(printifyOrderBody),
      }
    );

    const data = await resp.json();

    if (!resp.ok) {
      console.error("❌ Printify order error:", data);
      return res
        .status(500)
        .json({ ok: false, error: "Printify order failed", details: data });
    }

    console.log("✅ Printify order created:", data.id || data);
    return res.status(200).json({ ok: true, printify: data });
  } catch (err) {
    console.error("❌ shopify-order-webhook error:", err);
    return res.status(500).json({
      ok: false,
      error: err?.message || "Unknown error",
    });
  }
}
