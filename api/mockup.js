// api/mockup.js
import sharp from "sharp";

// 1. BAZOWE MOCKUPY – TWOJE URL-e z Shopify Files
const BASE_IMAGES = {
  "white-front":
    "https://cdn.shopify.com/s/files/1/0955/5594/4777/files/mockup_white_front.png?v=1764000531",
  "white-back":
    "https://cdn.shopify.com/s/files/1/0955/5594/4777/files/mockup_white_back.png?v=1764000460",
  "black-front":
    "https://cdn.shopify.com/s/files/1/0955/5594/4777/files/mockup_black_front.png?v=1764000531",
  "black-back":
    "https://cdn.shopify.com/s/files/1/0955/5594/4777/files/mockup_black_back.png?v=1764000459",
};

// 2. POLA NADRUKU – współrzędne liczone dla mockupów 2048×1365
// FRONT – prawa koszulka; BACK – lewa koszulka
const PRINT_AREAS = {
  // FRONT: prawa koszulka – środek klaty
  "white-front": { left: 1120, top: 640, width: 620, height: 540 },
  "black-front": { left: 1120, top: 640, width: 620, height: 540 },

  // BACK: lewa koszulka – środek pleców
  "white-back": { left: 460, top: 640, width: 620, height: 540 },
  "black-back": { left: 460, top: 640, width: 620, height: 540 },
};

// 3. GŁÓWNY HANDLER
export default async function handler(req, res) {
  // ---------- CORS ----------
  const origin = req.headers.origin || "";
  const allowedOrigins = [
    "https://ownaimerch.com",
    "https://www.ownaimerch.com",
    "https://ownaimerch.myshopify.com",
  ];

  if (allowedOrigins.includes(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
  }

  res.setHeader("Vary", "Origin");
  res.setHeader("Access-Control-Allow-Methods", "POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    res.status(200).end();
    return;
  }

  if (req.method !== "POST") {
    res.status(405).json({ error: "Only POST allowed" });
    return;
  }
  // ---------- KONIEC CORS ----------

  try {
    const { color, side, designUrl } = req.body || {};

    if (!color || !side || !designUrl) {
      res
        .status(400)
        .json({ error: "Missing color, side or designUrl in body." });
      return;
    }

    const key = `${String(color).toLowerCase()}-${String(side).toLowerCase()}`;
    const baseUrl = BASE_IMAGES[key];
    const area = PRINT_AREAS[key];

    if (!baseUrl || !area) {
      res.status(400).json({ error: "Unknown mockup type: " + key });
      return;
    }

    // pobieramy bazowy mockup i wygenerowaną grafikę AI
    const [baseBuf, designBuf] = await Promise.all([
      fetch(baseUrl)
        .then((r) => r.arrayBuffer())
        .then((b) => Buffer.from(b)),
      fetch(designUrl)
        .then((r) => r.arrayBuffer())
        .then((b) => Buffer.from(b)),
    ]);

    // dopasowanie projektu do pola nadruku
    const designResized = await sharp(designBuf)
      .resize(area.width, area.height, { fit: "cover" })
      .png()
      .toBuffer();

    // złożenie mockupu
    const composed = await sharp(baseBuf)
      .composite([
        {
          input: designResized,
          left: area.left,
          top: area.top,
        },
      ])
      .jpeg({ quality: 90 })
      .toBuffer();

    res.setHeader("Content-Type", "image/jpeg");
    res.status(200).send(composed);
  } catch (err) {
    console.error("Mockup error:", err);
    res.status(500).json({ error: "Mockup generation failed" });
  }
}
