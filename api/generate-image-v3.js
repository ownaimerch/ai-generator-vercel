// api/generate-image-v3.js
import OpenAI from "openai";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const PRINTIFY_API_KEY = process.env.PRINTIFY_API_TOKEN;
const REMOVEBG_API_KEY = process.env.REMOVEBG_API_KEY;

// ---------- PSEUDO-BAZA UŻYTKOWNIKÓW (IN-MEMORY) ----------
// Uwaga: na Vercelu to NIE jest trwałe – po re-deployu / restarcie znika.
// To jest SZKIELET logiki kredytów, nie finalna baza.
const memoryUsers = new Map(); // key: "cust_<id>" / "email_<email>"

// pomocnicze: klucz usera
function getUserKey(customer) {
  if (!customer) return null;
  if (customer.id != null) return "cust_" + String(customer.id);
  if (customer.email) return "email_" + String(customer.email).toLowerCase();
  return null;
}

// pobierz lub utwórz rekord usera
function getOrCreateUser(customer) {
  const key = getUserKey(customer);
  if (!key) return null;

  if (!memoryUsers.has(key)) {
    memoryUsers.set(key, {
      id: customer.id || null,
      email: customer.email || null,
      freeUsed: false,      // czy zużył już darmową generację
      credits: 0,           // kredyty z pakietów (na razie 0)
      canRemoveBg: false,   // czy plan obejmuje remove.bg (na razie false)
    });
  }
  return memoryUsers.get(key);
}

function saveUser(customer, userRecord) {
  const key = getUserKey(customer);
  if (!key) return;
  memoryUsers.set(key, userRecord);
}

// ile darmowych generacji na konto
const MAX_FREE_GENERATIONS_PER_USER = 1;

// ---------- remove.bg – bez zmian ----------
async function maybeRemoveBackground(b64, removeBackground) {
  if (!removeBackground) return b64;

  if (!REMOVEBG_API_KEY) {
    console.warn("⚠️ REMOVEBG_API_KEY missing – skip background removal");
    return b64;
  }

  try {
    const params = new URLSearchParams();
    params.append("image_file_b64", b64);
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
      console.error(
        "❌ remove.bg error:",
        resp.status,
        resp.statusText,
        errText
      );
      return b64;
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
  // ---------- CORS ----------
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
    const customer = body?.customer || null; // <-- dochodzi z frontu

    if (!prompt || prompt.length < 3) {
      return res.status(400).json({ error: "Prompt too short." });
    }

    // ---------- WYMAGAMY KONTA ----------
    if (!customer || (!customer.id && !customer.email)) {
      return res.status(401).json({
        error: "You must be logged in to use the AI generator.",
        code: "NOT_AUTHENTICATED",
      });
    }

    const user = getOrCreateUser(customer);
    if (!user) {
      return res
        .status(500)
        .json({ error: "Cannot create user record." });
    }

    const wantsRemoveBg = removeBackground === true;

    // ---------- BLOKADA REMOVE.BG BEZ PLANU ----------
    if (wantsRemoveBg && !user.canRemoveBg) {
      return res.status(403).json({
        error: "Your current plan does not include background removal.",
        code: "NO_REMOVE_BG",
      });
    }

    // ---------- LOGIKA 1 FREE + KREDYTY ----------
    let canGenerate = false;
    let usingFree = false;

    if (!user.freeUsed && user.credits <= 0) {
      // darmowa generacja (tylko 1 na konto)
      canGenerate = true;
      usingFree = true;
    } else if (user.credits > 0) {
      // generacja z kredytu
      canGenerate = true;
      usingFree = false;
    }

    if (!canGenerate) {
      return res.status(402).json({
        error:
          "You have used your free generation and have no credits left. Please buy a package to generate more designs.",
        code: "NO_CREDITS",
      });
    }

    if (!PRINTIFY_API_KEY) {
      console.error("PRINTIFY_API_TOKEN is missing");
      return res
        .status(500)
        .json({ error: "Server misconfigured: no PRINTIFY_API_TOKEN" });
    }

    // ---------- 1) Generowanie obrazu w OpenAI ----------
    const dalle = await openai.images.generate({
      model: "dall-e-3",
      prompt,
      size: "1024x1024",
      response_format: "b64_json",
    });

    let b64 = dalle?.data?.[0]?.b64_json;
    if (!b64) {
      console.error("No image from OpenAI response:", dalle);
      return res
        .status(500)
        .json({ error: "No image returned from OpenAI" });
    }

    // ---------- 2) Opcjonalne usuwanie tła ----------
    b64 = await maybeRemoveBackground(b64, wantsRemoveBg);

    // ---------- 3) Upload do Printify ----------
    const uploadBody = {
      file_name: `ai-${Date.now()}.png`,
      contents: b64,
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

    // ---------- dopiero TU zapisujemy zużycie free / kredytu ----------
    if (usingFree) {
      user.freeUsed = true;
    } else if (!usingFree && user.credits > 0) {
      user.credits = user.credits - 1;
    }
    saveUser(customer, user);

    return res.status(200).json({
      ok: true,
      aiId,
      prompt,
      imageUrl,
      // bonus info na przyszłość
      creditsLeft: user.credits,
      freeUsed: user.freeUsed,
      canRemoveBg: user.canRemoveBg,
    });
  } catch (err) {
    console.error("❌ generate-image-v3 error:", err);
    return res
      .status(500)
      .json({ error: err?.message || "Unknown server error" });
  }
}
