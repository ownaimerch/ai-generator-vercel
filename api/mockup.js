// api/mockup.js
import sharp from "sharp";

// BAZOWE MOCKUPY – tu masz już poprawne URL-e z Shopify Files
const BASE_IMAGES = {
  "white-front": "https://cdn.shopify.com/s/files/1/0955/5594/4777/files/mockup_white_front.png?v=1764000531",
  "white-back":  "https://cdn.shopify.com/s/files/1/0955/5594/4777/files/mockup_white_back.png?v=1764000460",
  "black-front": "https://cdn.shopify.com/s/files/1/0955/5594/4777/files/mockup_black_front.png?v=1764000531",
  "black-back":  "https://cdn.shopify.com/s/files/1/0955/5594/4777/files/mockup_black_back.png?v=1764000459"
};

// POLE NADRUKU – startowa wersja, którą potem będziemy dopieszczać
// Mockupy są 2048 x 1365 px
const PRINT_AREAS = {
  // FRONT – prawa koszulka
  "white-front": {
    left: 1220,
    top: 630,
    width: 520,
    height: 520
  },
  "black-front": {
    left: 1220,
    top: 630,
    width: 520,
    height: 520
  },

  // BACK – lewa koszulka
  "white-back": {
    left: 430,
    top: 630,
    width: 520,
    height: 520
  },
  "black-back": {
    left: 430,
    top: 630,
    width: 520,
    height: 520
  }
};

export const config = {
  api: {
    bodyParser: {
      sizeLimit: "10mb"
    }
  }
};

export default async function handler(req, res) {
  // ---------- CORS ----------
  const origin = req.headers.origin || "";
  const allowedOrigins = [
    "https://ownaimerch.com",
    "https://www.ownaimerch.com",
    "https://ownaimerch.myshopify.com"
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
  // ---------- KONIEC CORS ----------

  if (req.method !== "POST") {
    res.status(405).json({ error: "Only POST allowed" });
    return;
  }

  try {
    const { color, side, designUrl } = req.body || {};

    if (!color || !side || !designUrl) {
      res.status(400).json({ error: "Missing color, side or designUrl" });
      return;
    }

    const key = `${color.toLowerCase()}-${side.toLowerCase()}`; // np. "black-back"
    const baseUrl = BASE_IMAGES[key];
    const printArea = PRINT_AREAS[key];

    if (!baseUrl || !printArea) {
      res.status(400).json({ error: "Unknown mockup type " + key });
      return;
    }

    // pobierz bazowy mockup i wygenerowany obraz z AI
    const [baseBuf, designBuf] = await Promise.all([
      fetch(baseUrl).then((r) => r.arrayBuffer()).then((b) => Buffer.from(b)),
      fetch(designUrl).then((r) => r.arrayBuffer()).then((b) => Buffer.from(b))
    ]);

    // dopasuj projekt do pola nadruku
    const designResized = await sharp(designBuf)
      .resize(printArea.width, printArea.height, { fit: "cover" })
      .png()
      .toBuffer();

    // sklej wszystko
    const composed = await sharp(baseBuf)
      .composite([
        {
          input: designResized,
          top: printArea.top,
          left: printArea.left
        }
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
