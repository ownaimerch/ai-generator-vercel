// api/generate-image-v3.js
import OpenAI from "openai";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// Używamy Printify PAT – tego samego, którego używasz w PowerShellu
const PRINTIFY_API_KEY = process.env.PRINTIFY_API_TOKEN;

export default async function handler(req, res) {
  // Prosty CORS – jak miałeś wcześniej
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Access-Control-Max-Age", "86400");
  if (req.method === "OPTIONS") return res.status(204).end();

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Use POST" });
  }

  try {
    let body = req.body;
    if (typeof body === "string") {
      try {
        body = JSON.parse(body || "{}");
      } catch {
        body = {};
      }
    }

    const prompt = (body?.prompt || "").trim();
    if (!prompt || prompt.length < 3) {
      return res.status(400).json({ error: "Prompt too short." });
    }

    if (!PRINTIFY_API_KEY) {
      console.error("PRINTIFY_API_KEY is missing");
      return res
        .status(500)
        .json({ error: "Server misconfigured: no PRINTIFY_API_KEY" });
    }

    // 1) Generowanie obrazu w OpenAI (DALL·E 3 → base64)
    const dalle = await openai.images.generate({
      model: "dall-e-3",
      prompt,
      size: "1024x1024",
      response_format: "b64_json",
    });

    const b64 = dalle?.data?.[0]?.b64_json;
    if (!b64) {
      console.error("No image from OpenAI response:", dalle);
      return res.status(500).json({ error: "No image returned from OpenAI" });
    }

    // 2) Upload do Printify (base64 → obraz w ich storage)
    const uploadBody = {
      file_name: `ai-${Date.now()}.png`,
      contents: b64, // UWAGA: sama base64, bez "data:image/..."
    };

    const printifyResponse = await fetch(
      "https://api.printify.com/v1/uploads/images.json",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${PRINTIFY_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(uploadBody),
      }
    );

    const printifyJson = await printifyResponse.json();

    if (!printifyResponse.ok) {
      console.error("❌ Printify upload error:", printifyJson);
      return res.status(500).json({
        error: "Printify upload failed",
        details: printifyJson,
      });
    }

    // Printify zwraca m.in. id, file_url, preview_url
    const imageUrl =
      printifyJson.file_url || printifyJson.preview_url || null;

    if (!imageUrl) {
      console.error("Printify response missing image URL:", printifyJson);
      return res
        .status(500)
        .json({ error: "Printify did not return image URL" });
    }

    const aiId =
      "ai-" + Date.now() + "-" + Math.random().toString(36).slice(2);

    // 3) Zwracamy mały JSON: bez base64
    return res.status(200).json({
      ok: true,
      aiId,
      prompt,
      imageUrl, // URL z Printify – użyjemy go i do podglądu, i w zamówieniu
    });
  } catch (err) {
    console.error("❌ generate-image-v3 error:", err);
    return res
      .status(500)
      .json({ error: err?.message || "Unknown server error" });
  }
}
