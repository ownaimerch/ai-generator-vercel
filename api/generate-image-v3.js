// api/generate-image-v3.js
import { OpenAI } from "openai";
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// domeny sklepu (klienci). ZAWSZE z https://
const ALLOWED_ORIGINS = [
  "https://ownaimerch.com",
  "https://www.ownaimerch.com",
  "https://own-ai-merch.myshopify.com",
  "https://rjdmq-q4.myshopify.com",
];

function corsHeaders(origin = "") {
  // pozwól na lokalny plik testowy (Origin: null)
  if (!origin || origin === "null") {
    return {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST,OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
      "Access-Control-Max-Age": "86400",
      "Vary": "Origin",
    };
  }
  const allow = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    "Access-Control-Allow-Origin": allow,
    "Access-Control-Allow-Methods": "POST,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "86400",
    "Vary": "Origin",
  };
}

export default async function handler(req, res) {
  console.log("HIT /generate-image-v3", { method: req.method, origin: req.headers.origin });

  // NARZĘDZIOWO (tymczasowo): pełne otwarcie CORS
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(204).end();

  // SZYBKI TEST GET — pozwala sprawdzić w ogóle połączenie
  if (req.method === "GET") {
    return res.status(200).json({ ok: true, note: "GET ok – POST dopiero generuje obraz" });
  }

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  // ... (tu Twoja dotychczasowa logika POST z OpenAI)
}

  try {
    // bezpieczne parsowanie body (czasem jest string)
    let body = req.body;
    if (typeof body === "string") {
      try { body = JSON.parse(body || "{}"); } catch { body = {}; }
    }
    const prompt = (body?.prompt || "").trim();
    if (prompt.length < 3) return res.status(400).json({ error: "Prompt too short." });

    // Generacja obrazu (stabilnie na base64)
    const resp = await openai.images.generate({
      model: "gpt-image-1",          // możesz zamienić na "dall-e-3"
      prompt,
      size: "1024x1024",
    });

    const b64 = resp?.data?.[0]?.b64_json;
    if (!b64) return res.status(500).json({ error: "No image returned" });

    return res.status(200).json({ base64: `data:image/png;base64,${b64}` });
  } catch (err) {
    console.error("❌ generate-image error:", err);
    return res.status(500).json({
      error: err?.response?.data?.error?.message || err?.message || "Unknown error",
    });
  }
}
