// api/mockup.js
import sharp from "sharp";

// 1. PODMIEŃ TE 4 LINKI NA SWOJE Z SHOPIFY FILES
// (pełne URLe do JPG/PNG, które wgrywałeś jako mockupy bazowe BEZ napisu)
const BASE_IMAGES = {
  "white-front": "https://cdn.shopify.com/s/files/1/0955/5594/4777/files/mockup_white_front.png?v=1764000531", // TODO
  "white-back":  "https://cdn.shopify.com/s/files/1/0955/5594/4777/files/mockup_white_back.png?v=1764000460",  // TODO
  "black-front": "https://cdn.shopify.com/s/files/1/0955/5594/4777/files/mockup_black_front.png?v=1764000531", // TODO
  "black-back":  "https://cdn.shopify.com/s/files/1/0955/5594/4777/files/mockup_black_back.png?v=1764000459",  // TODO
};

// 2. Pole nadruku (na start na oko, potem dopieścimy)
// Współrzędne pola nadruku dopasowane do Twoich mockupów 2048x1365

const PRINT_AREAS = {
  // FRONT – nadruk na prawej koszulce
  "white-front": {
    left: 1210,   // start w poziomie
    top: 380,     // start w pionie
    width: 480,   // szerokość nadruku
    height: 480   // wysokość nadruku
  },
  "black-front": {
    left: 1210,
    top: 380,
    width: 480,
    height: 480
  },

  // BACK – nadruk na lewej koszulce
  "white-back": {
    left: 504,
    top: 374,
    width: 420,
    height: 280
  },
  "black-back": {
    left: 504,
    top: 374,
    width: 420,
    height: 280
  }
};

export const config = {
  api: {
    bodyParser: {
      sizeLimit: "10mb",
    },
  },
};

export default async function handler(req, res) {
  // ---------- CORS (TO JUŻ U CIEBIE ZADZIAŁAŁO – ZOSTAWIAMY) ----------
  const origin = req.headers.origin || "";
  const allowedOrigins = [
    "https://ownaimerch.com",
    "https://www.ownaimerch.com",
    "https://ownaimerch.myshopify.com" // dodaj tu, jeśli używasz domeny myshopify
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

    // np. white-front, black-back
    const key = `${color.toLowerCase()}-${side.toLowerCase()}`;
    const baseUrl = BASE_IMAGES[key];
    const printArea = PRINT_AREAS[key];

    if (!baseUrl || !printArea) {
      res.status(400).json({ error: "Unknown mockup type " + key });
      return;
    }

    // pobierz bazowy mockup i wygenerowany obraz z AI
    const [baseBuf, designBuf] = await Promise.all([
      fetch(baseUrl).then((r) => r.arrayBuffer()).then((b) => Buffer.from(b)),
      fetch(designUrl).then((r) => r.arrayBuffer()).then((b) => Buffer.from(b)),
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
