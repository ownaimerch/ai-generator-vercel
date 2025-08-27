import OpenAI from "openai";
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export default async function handler(req, res) {
  // Twarde CORS na czas testu – pozwól wszystkim
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Access-Control-Max-Age", "86400");

  if (req.method === "OPTIONS") return res.status(204).end();

  // Prosty sanity-check
  if (req.method === "GET" && !req.url.includes("prompt=")) {
    return res.status(200).json({ ok: true, note: "GET ok – użyj ?prompt=..." });
  }

  try {
    // 1) Pobierz prompt z GET (?prompt=...)
    let prompt =
      new URL(req.url, "http://x").searchParams.get("prompt") || "";

    // 2) Albo z POST (body może być JSON albo text/plain)
    if (!prompt && req.method === "POST") {
      let body = req.body;
      if (typeof body === "string") {
        try { body = JSON.parse(body || "{}"); } catch { body = {}; }
      }
      prompt = (body?.prompt || "").trim();
    }

    if (!prompt || prompt.trim().length < 3) {
      return res.status(400).json({ error: "Prompt too short." });
    }

    // Generowanie obrazu (base64 — najprościej wyświetlić na froncie)
    const resp = await openai.images.generate({
      model: "gpt-image-1",   // możesz zmienić na "dall-e-3"
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
