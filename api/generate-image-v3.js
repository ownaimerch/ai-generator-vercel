// api/generate-image-v3.js
import OpenAI from "openai";
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export default async function handler(req, res) {
  // CORS – na czas testów otwarte
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Access-Control-Max-Age", "86400");
  if (req.method === "OPTIONS") return res.status(204).end();

  // GET bez prompta — sanity check
  if (req.method === "GET" && !req.url.includes("prompt=")) {
    return res.status(200).json({ ok: true, note: "GET ok – użyj ?prompt=..." });
  }

  try {
    // prompt z GET
    let prompt = new URL(req.url, "http://x").searchParams.get("prompt") || "";

    // prompt z POST (obsłuży application/json i text/plain)
    if (!prompt && req.method === "POST") {
      let body = req.body;
      if (typeof body === "string") { try { body = JSON.parse(body || "{}"); } catch { body = {}; } }
      prompt = (body?.prompt || "").trim();
    }

    if (!prompt || prompt.length < 3) {
      return res.status(400).json({ error: "Prompt too short." });
    }

    // DALL·E 3 → base64 (bez url)
    const resp = await openai.images.generate({
      model: "dall-e-3",
      prompt,
      size: "1024x1024",
      response_format: "b64_json",
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
