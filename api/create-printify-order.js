// api/create-printify-order.js

const PRINTIFY_API_URL = "https://api.printify.com/v1";

// STAŁA KONFIGURACJA NADRUKU – TEGO JUŻ NIE RUSZAMY
const STANDARD_PRINT_AREA = {
  scale: 0.55,
  x: 0.5,
  y: 0.42,
  angle: 0,
};

// domyślne ID produktu jaki testowałeś – Comfort Colors 1717, Orchid / 3XL
const DEFAULT_PRODUCT = {
  print_provider_id: 99,
  blueprint_id: 706,
  variant_id: 79153,
};

export default async function handler(req, res) {
  // CORS – jak w drugim endpointzie
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Access-Control-Max-Age", "86400");
  if (req.method === "OPTIONS") return res.status(204).end();

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const PRINTIFY_TOKEN = process.env.PRINTIFY_API_TOKEN;
  const PRINTIFY_SHOP_ID = process.env.PRINTIFY_SHOP_ID;

  if (!PRINTIFY_TOKEN || !PRINTIFY_SHOP_ID) {
    return res.status(500).json({
      error: "Missing PRINTIFY_API_TOKEN or PRINTIFY_SHOP_ID env vars",
    });
  }

  // --- 1. Parsowanie body ---

  let body = req.body;
  if (typeof body === "string") {
    try {
      body = JSON.parse(body || "{}");
    } catch {
      body = {};
    }
  }

  const base64 = (body?.base64 || "").trim(); // obraz z /api/generate-image-v3
  const prompt = (body?.prompt || "").trim(); // opcjonalnie – opis
  const shipping = body?.shipping || {};

  if (!base64) {
    return res.status(400).json({ error: "Missing base64 image" });
  }

  // proste domyślne dane wysyłki (zaraz w kroku 2 podmienimy na prawdziwy adres z Shopify)
  const address_to = {
    first_name: shipping.first_name || "Test",
    last_name: shipping.last_name || "Customer",
    email: shipping.email || "test@example.com",
    phone: shipping.phone || "000000000",
    country: shipping.country || "US",
    region: shipping.region || "",
    address1: shipping.address1 || "Test Street 1",
    address2: shipping.address2 || "",
    city: shipping.city || "Test City",
    zip: shipping.zip || "00000",
  };

  const extOrderId =
    body.external_id ||
    `ai-${Date.now()}-${Math.random().toString(16).slice(2, 10)}`;

  try {
    // --- 2. Upload base64 do Printify (contents) ---

    const uploadResp = await fetch(`${PRINTIFY_API_URL}/uploads/images.json`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${PRINTIFY_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        file_name: `ai-${Date.now()}.png`,
        contents: base64, // UWAGA: sama base64, bez "data:image..."
      }),
    });

    if (!uploadResp.ok) {
      const errText = await uploadResp.text();
      console.error("❌ Printify upload error:", errText);
      return res
        .status(502)
        .json({ error: "Printify upload failed", details: errText });
    }

    const uploadData = await uploadResp.json();
    const imageSrc = uploadData.preview_url;
    if (!imageSrc) {
      return res
        .status(502)
        .json({ error: "No preview_url returned from Printify upload" });
    }

    // --- 3. Order body z NASZĄ STAŁĄ KONFIGURACJĄ NADRUKU ---

    const lineItem = {
      print_provider_id:
        body.print_provider_id || DEFAULT_PRODUCT.print_provider_id,
      blueprint_id: body.blueprint_id || DEFAULT_PRODUCT.blueprint_id,
      variant_id: body.variant_id || DEFAULT_PRODUCT.variant_id,
      quantity: body.quantity || 1,
      external_id: `${extOrderId}-1`,
      print_areas: {
        front: [
          {
            src: imageSrc,
            scale: STANDARD_PRINT_AREA.scale,
            x: STANDARD_PRINT_AREA.x,
            y: STANDARD_PRINT_AREA.y,
            angle: STANDARD_PRINT_AREA.angle,
          },
        ],
      },
    };

    const orderPayload = {
      external_id: extOrderId,
      label: extOrderId,
      line_items: [lineItem],
      shipping_method: body.shipping_method || 1,
      is_printify_express: false,
      is_economy_shipping: false,
      send_shipping_notification: false,
      address_to,
    };

    // --- 4. Wysłanie ordera do Printify ---

    const orderResp = await fetch(
      `${PRINTIFY_API_URL}/shops/${PRINTIFY_SHOP_ID}/orders.json`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${PRINTIFY_TOKEN}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(orderPayload),
      }
    );

    const orderData = await orderResp.json();

    if (!orderResp.ok) {
      console.error("❌ Printify order error:", orderData);
      return res.status(502).json({
        error: "Printify order failed",
        details: orderData,
      });
    }

    // --- 5. Odpowiedź do frontu ---

    return res.status(200).json({
      ok: true,
      prompt,
      imageSrc, // URL na CDN Printify
      order: orderData,
      printArea: STANDARD_PRINT_AREA,
    });
  } catch (err) {
    console.error("❌ create-printify-order error:", err);
    return res.status(500).json({
      error: err?.message || "Unknown error",
    });
  }
}
