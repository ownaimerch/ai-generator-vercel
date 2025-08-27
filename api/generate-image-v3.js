import { OpenAI } from "openai";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// ← DODAJ: listę dozwolonych originów (z https://)
const ALLOWED_ORIGINS = [
  "ownaimerch.com",
  "own-ai-merch.myshopify.com",
  "rjd1mq-q4.myshopify.com",
  "www.ownaimerch.com"
];

// pomocnicze nagłówki CORS
function corsHeaders(origin = "") {
  const allow = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    "Access-Control-Allow-Origin": allow,
    "Access-Control-Allow-Methods": "POST,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };
}

export default async function handler(req, res) {
  const origin = req.headers.origin || "";
  const cors = corsHeaders(origin);

  // ZAWSZE doklej nagłówki CORS do odpowiedzi
  Object.entries(cors).forEach(([k, v]) => res.setHeader(k, v));

  // Preflight z przeglądarki
  if (req.method === "OPTIONS") {
    return res.status(204).end();
  }

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    // Jeżeli front wysyła application/json, Vercel zwykle daje tu już obiekt
    // (gdyby było undefined, użyj: const { prompt } = JSON.parse(req.body || "{}");
    const { prompt } = req.body || {};

    if (!prompt || prompt.trim().length < 3) {
      return res.status(400).json({ error: "Prompt too short." });
    }

    // --- Generowanie obrazu ---
    // Masz „dall-e-3” + response_format:url — ok, jeśli działa.
    // Rekomendacja SDK 5.x: model "gpt-image-1" i odbiór base64 (stabilniej).
    const response = await openai.images.generate({
      model: "dall-e-3",        // ewentualnie: "gpt-image-1"
      prompt,
      n: 1,
      size: "1024x1024",
      response_format: "url",   // ewentualnie usuń i odbieraj base64 (b64_json)
    });

    // URL wariant:
    const imageUrl = response.data[0].url;

    return res.status(200).json({ imageUrl });
  } catch (err) {
    console.error("❌ OpenAI error:", err);
    return res.status(500).json({
      error:
        err?.response?.data?.error?.message ||
        err?.message ||
        "Unknown error",
    });
  }
}
