// api/generate-image-v3.js
import OpenAI from "openai";
import { getOrCreateUser, chargeCredits, CREDIT_COSTS } from ".../credits.js";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const PRINTIFY_API_KEY = process.env.PRINTIFY_API_TOKEN;
const REMOVEBG_API_KEY = process.env.REMOVEBG_API_KEY;

/**
 * Usuwanie tła przez remove.bg – zwraca base64 PNG
 */
async function maybeRemoveBackground(b64, removeBackground) {
  if (!removeBackground) return b64;

  if (!REMOVEBG_API_KEY) {
    console.warn("⚠️ REMOVEBG_API_KEY missing – skip background removal");
    return b64;
  }

  try {
    const params = new URLSearchParams();
    params.append("image_file_b64", b64); // sama base64
    params.append("size", "auto");
    params.append("format", "png");

    const resp = await fetch("https://api.remove.bg/v1.0/removebg", {
      method: "POST",
      headers: {
        "X-Api-Key": REMOVEBG_API_KEY,
      },
      body: params,
    });

    if (!resp.ok) {
      const errText = await resp.text();
      console.error("❌ remove.bg error:", resp.status, resp.statusText, errText);
      return b64; // w razie błędu wolimy mieć obraz z tłem niż żaden
    }

    const arrayBuffer = await resp.arrayBuffer();
    const outB64 = Buffer.from(arrayBuffer).toString("base64");

    console.log("✅ remove.bg OK – background removed");
    return outB64;
  } catch (e) {
    console.error("❌ remove.bg exception:", e);
    return b64;
  }
}

export default async function handler(req, res) {
  // CORS
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
    const removeBackground = !!body?.removeBackground;
    const customer = body?.customer || null; // { id, email } – z frontu

    if (!prompt || prompt.length < 3) {
      return res.status(400).json({ error: "Prompt too short." });
    }

    if (!customer || !customer.id) {
      return res.status(401).json({ error: "Login required." });
    }

    if (!PRINTIFY_API_KEY) {
      console.error("PRINTIFY_API_TOKEN is missing");
      return res
        .status(500)
        .json({ error: "Server misconfigured: no PRINTIFY_API_TOKEN" });
    }

    // 1) User + kredyty
    const user = await getOrCreateUser(customer);

    // ile kredytów potrzeba
    let cost = CREDIT_COSTS.GENERATE;
    if (removeBackground) {
      cost += CREDIT_COSTS.REMOVE_BG_EXTRA;
    }

    if ((user.credits || 0) < cost) {
      return res.status(402).json({
        error: "INSUFFICIENT_CREDITS",
        message: "Not enough credits. Please buy a package.",
        credits: user.credits || 0,
        needed: cost,
      });
    }

    // 2) Generowanie obrazu w OpenAI
    const dalle = await openai.images.generate({
      model: "dall-e-3",
      prompt,
      size: "1024x1024",
      response_format: "b64_json",
    });

    let b64 = dalle?.data?.[0]?.b64_json;
    if (!b64) {
      console.error("No image from OpenAI response:", dalle);
      return res.status(500).json({ error: "No image returned from OpenAI" });
    }

    // 3) Opcjonalne usuwanie tła przez remove.bg
    b64 = await maybeRemoveBackground(b64, removeBackground);

    // 4) Upload do Printify
    const uploadBody = {
      file_name: `ai-${Date.now()}.png`,
      contents: b64, // sama base64
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

    // 5) Dopiero TERAZ zdejmujemy kredyty (bo generacja się udała)
    try {
      await chargeCredits(user.id, cost, {
        type: removeBackground ? "generate+remove_bg" : "generate",
        prompt,
      });
    } catch (creditErr) {
      // jak coś pójdzie nie tak – logujemy, ale klient dostaje obraz
      console.error("❌ chargeCredits error:", creditErr);
    }

    return res.status(200).json({
      ok: true,
      aiId,
      prompt,
      imageUrl,
      cost,
    });
  } catch (err) {
    console.error("❌ generate-image-v3 error:", err);
    if (err.code === "INSUFFICIENT_CREDITS") {
      return res.status(402).json({ error: "INSUFFICIENT_CREDITS" });
    }
    return res
      .status(500)
      .json({ error: err?.message || "Unknown server error" });
  }
}
