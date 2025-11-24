// api/mockup.js
import sharp from "sharp";

// TU WKLEJASZ URL-E DO SWOICH 4 MOCKUPÓW (PNG/JPG z Shopify Files)
const BASE_IMAGES = {
  "white-front": "https://cdn.shopify.com/s/files/1/0955/5594/4777/files/mockup_white_front.png?v=1764000531",
  "white-back":  "https://cdn.shopify.com/s/files/1/0955/5594/4777/files/mockup_white_back.png?v=1764000460",
  "black-front": "https://cdn.shopify.com/s/files/1/0955/5594/4777/files/mockup_black_front.png?v=1764000531",
  "black-back":  "https://cdn.shopify.com/s/files/1/0955/5594/4777/files/mockup_black_back.png?v=1764000459",
};

// obszary nadruku – na razie przykładowe, potem dopasujemy
const PRINT_AREAS = {
  "white-front": { left: 820, top: 520, width: 900, height: 900 },
  "white-back":  { left: 820, top: 520, width: 900, height: 900 },
  "black-front": { left: 820, top: 520, width: 900, height: 900 },
  "black-back":  { left: 820, top: 520, width: 900, height: 900 },
};

export const config = {
  api: {
    bodyParser: {
      sizeLimit: "10mb",
    },
  },
};

export default async function handler(req, res) {
  // ---------- CORS ----------
  const origin = req.headers.origin || "";
  const allowedOrigins = [
    "https://ownaimerch.com",
    "https://www.ownaimerch.com",
    "https://app.ownaimerch.com",        // jeśli odpalasz coś z subdomeny
    "https://ai-generator-ower.vercel.app" // podgląd na Vercelu (opcjonalnie)
  ];

  if (allowedOrigins.includes(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
  }

  res.setHeader("Vary", "Origin");
  res.setHeader("Access-Control-Allow-Methods", "POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    // preflight – tylko nagłówki CORS i kończymy
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

    const key = `${color.toLowerCase()}-${side.toLowerCase()}`; // np. "white-front"
    const baseUrl = BASE_IMAGES[key];
    const printArea = PRINT_AREAS[key];

    if (!baseUrl || !printArea) {
      res.status(400).json({ error: "Unknown mockup type " + key });
      return;
    }

    // pobieramy bazowy mockup + obraz z AI
    const [baseBuf, designBuf] = await Promise.all([
      fetch(baseUrl).then((r) => r.arrayBuffer()).then((b) => Buffer.from(b)),
      fetch(designUrl).then((r) => r.arrayBuffer()).then((b) => Buffer.from(b)),
    ]);

    // dopasowanie projektu do pola nadruku
    const designResized = await sharp(designBuf)
      .resize(printArea.width, printArea.height, { fit: "cover" })
      .png()
      .toBuffer();

    const composed = await sharp(baseBuf)
      .composite([
        {
          input: designResized,
          top: printArea.top,
          left: printArea.left,
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
