// api/generate-image-v3.js
import OpenAI from "openai";

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export default async function handler(req, res) {
  // CORS – możesz zostawić jak jest, ale ten zestaw działa
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Access-Control-Max-Age", "86400");
  if (req.method === "OPTIONS") {
    return res.status(204).end();
  }

  // akceptujemy TYLKO POST do generowania
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  // bezpieczne parsowanie body (może być obiektem lub stringiem)
  let body = req.body;
  if (typeof body === "string") {
    try {
      body = JSON.parse(body || "{}");
    } catch {
      body = {};
    }
  }

  const prompt = (body?.prompt || "").trim();
  if (!prompt) {
    return res.status(400).json({ error: "Missing prompt" });
  }

  try {
    const resp = await client.images.generate({
      model: "dall-e-3",
      prompt,
      size: "1024x1024",
      n: 1,
      response_format: "b64_json", // KLUCZOWE: zwracamy base64
    });

    const b64 = resp?.data?.[0]?.b64_json;
    if (!b64) {
      return res.status(500).json({ error: "No image returned" });
    }

    // BEZ "data:image/png;base64," – sama goła base64
    return res.status(200).json({ base64: b64 });
  } catch (err) {
    console.error("❌ generate-image-v3 error:", err);
    return res.status(500).json({
      error:
        err?.response?.data?.error?.message ||
        err?.message ||
        "Unknown error",
    });
  }
}
