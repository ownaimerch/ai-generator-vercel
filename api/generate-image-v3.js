// api/generate-image-v3.js
import OpenAI from "openai";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export default async function handler(req, res) {
  // ... Twój CORS + obsługa OPTIONS + pobranie prompta ... //

  try {
    // tu masz już zmienną `prompt` (sprawdzone, że nie jest za krótki)

    const resp = await openai.images.generate({
      model: "dall-e-3",
      prompt,
      size: "1024x1024",
      n: 1,
      response_format: "b64_json",   // <<< KLUCZOWE
    });

    const b64 = resp?.data?.[0]?.b64_json;
    if (!b64) {
      return res.status(500).json({ error: "No image returned" });
    }

    // FRONT: do <img> użyje data URL
    // BACKEND / Powershell: weźmie goły base64
    return res.status(200).json({ base64: b64 });
  } catch (err) {
    console.error("❌ generate-image error:", err);
    return res.status(500).json({
      error:
        err?.response?.data?.error?.message ||
        err?.message ||
        "Unknown error",
    });
  }
}
