// api/mockup.js
import sharp from "sharp";

// 1. URL-e bazowych mockupów z Shopify Files
const BASE_IMAGES = {
 // T-Shirt
  "white-front":
    "https://cdn.shopify.com/s/files/1/0955/5594/4777/files/white_back.jpg?v=1767378513",
  "white-back":
    "https://cdn.shopify.com/s/files/1/0955/5594/4777/files/white_back.jpg?v=1767378513",
  "black-front":
    "https://cdn.shopify.com/s/files/1/0955/5594/4777/files/black_back.jpg?v=1767378502",
  "black-back":
    "https://cdn.shopify.com/s/files/1/0955/5594/4777/files/black_back.jpg?v=1767378502",

    // --- HOODIE – FRONT (kolory: white, true navy, pepper)
  "navy-front":
    "https://cdn.shopify.com/s/files/1/0955/5594/4777/files/hoodie_navy.png?v=1767378497",
  "pepper-front":
    "https://cdn.shopify.com/s/files/1/0955/5594/4777/files/hoodie_peper.png?v=1767378496",
  "hoodie-white-front":
    "https://cdn.shopify.com/s/files/1/0955/5594/4777/files/hoodie_white.png?v=1767378499",

 // HOODIE – BACK
  "hoodie_mockup_navy_back":   "",
  "hoodie_mockup_peper_back": "",
  "hoodie_mockup_white_back": "",
};

// 2. Pola nadruku w PROCENTACH (0–1) względem całego obrazka
//    Możesz potem dopieszczać tylko te liczby (x, y, w, h)
const PRINT_AREAS_NORM = {
  // FRONT = prawa koszulka
  "white-front": { x: 0.575, y: 0.32, w: 0.13, h: 0.20 },
  "black-front": { x: 0.575, y: 0.32, w: 0.13, h: 0.20 },

  // BACK = lewa koszulka
  "white-back": { x: 0.278, y: 0.32, w: 0.14, h: 0.215 },
  "black-back": { x: 0.278, y: 0.32, w: 0.14, h: 0.215 },

   // FRONT HOODIE
  "navy-front":          { x: 0.25, y: 0.34, w: 0.13, h: 0.2 },
  "pepper-front":        { x: 0.25, y: 0.34, w: 0.13, h: 0.2 },
  "hoodie-white-front":  { x: 0.25, y: 0.34, w: 0.13, h: 0.2 },
};

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
    const areaNorm = PRINT_AREAS_NORM[key];

    if (!baseUrl || !areaNorm) {
      res.status(400).json({ error: "Unknown mockup type: " + key });
      return;
    }

    // pobierz bazowy mockup
    const baseBuf = Buffer.from(
      await (await fetch(baseUrl)).arrayBuffer()
    );

    // odczytujemy realną szerokość / wysokość mockupa
    const meta = await sharp(baseBuf).metadata();
    const baseW = meta.width || 0;
    const baseH = meta.height || 0;

    if (!baseW || !baseH) {
      throw new Error("Cannot read mockup size");
    }

    // przeliczamy procenty na piksele
    const printArea = {
      left: Math.round(areaNorm.x * baseW),
      top: Math.round(areaNorm.y * baseH),
      width: Math.round(areaNorm.w * baseW),
      height: Math.round(areaNorm.h * baseH),
    };

    console.log("MOCKUP", key, "SIZE", baseW, baseH, "AREA", printArea);

    // pobierz wygenerowaną grafikę
    const designBuf = Buffer.from(
      await (await fetch(designUrl)).arrayBuffer()
    );

    // dopasuj grafikę AI do pola nadruku
    const designResized = await sharp(designBuf)
      .resize(printArea.width, printArea.height, { fit: "cover" })
      .png()
      .toBuffer();

    // WSTAWIAMY Z WSPÓŁRZĘDNYMI – JEDYNY composite W PLIKU
    const composed = await sharp(baseBuf)
      .composite([
        {
          input: designResized,
          left: printArea.left,
          top: printArea.top,
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
