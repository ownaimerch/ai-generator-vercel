// api/mockup.js
import sharp from "sharp";

const BASE_IMAGES = {
  "white-front": "https://cdn.shopify.com/s/files/1/0955/5594/4777/files/mockup_white_front.png?v=1764000531",
  "white-back":  "https://cdn.shopify.com/s/files/1/0955/5594/4777/files/mockup_white_back.png?v=1764000460",
  "black-front": "https://cdn.shopify.com/s/files/1/0955/5594/4777/files/mockup_black_front.png?v=1764000531",
  "black-back":  "https://cdn.shopify.com/s/files/1/0955/5594/4777/files/mockup_black_back.png?v=1764000459"
};

// PROPORCJE pola nadruku (0–1, liczone względem szer./wys. mockupu)
// FRONT = prawa koszulka, BACK = lewa koszulka
const PRINT_LAYOUT = {
  // front – prawa
  "white-front": { left: 0.58, top: 0.32, width: 0.24, height: 0.32 },
  "black-front": { left: 0.58, top: 0.32, width: 0.24, height: 0.32 },

  // back – lewa
  "white-back":  { left: 0.18, top: 0.32, width: 0.24, height: 0.32 },
  "black-back":  { left: 0.18, top: 0.32, width: 0.24, height: 0.32 }
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
    const layout = PRINT_LAYOUT[key];

    if (!baseUrl || !layout) {
      res.status(400).json({ error: "Unknown mockup type " + key });
      return;
    }

    // pobierz bazę i projekt
    const baseBuf = Buffer.from(
      await fetch(baseUrl).then(r => r.arrayBuffer())
    );
    const designBuf = Buffer.from(
      await fetch(designUrl).then(r => r.arrayBuffer())
    );

    // odczytaj rozmiar mockupu
    const meta = await sharp(baseBuf).metadata();
    const W = meta.width || 2048;
    const H = meta.height || 1365;

    // przelicz proporcje → piksele
    const printArea = {
      left: Math.round(layout.left * W),
      top: Math.round(layout.top * H),
      width: Math.round(layout.width * W),
      height: Math.round(layout.height * H)
    };

    // dopasuj projekt do pola nadruku
    const designResized = await sharp(designBuf)
      .resize(printArea.width, printArea.height, { fit: "cover" })
      .png()
      .toBuffer();

    // sklej
    const composed = await sharp(baseBuf)
      .composite([
        {
          input: designResized,
          left: printArea.left,
          top: printArea.top
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
