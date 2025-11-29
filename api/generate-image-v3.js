// api/generate-image-v3.js
import OpenAI from "openai";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const PRINTIFY_API_KEY = process.env.PRINTIFY_API_TOKEN;
const REMOVEBG_API_KEY = process.env.REMOVEBG_API_KEY;

// Proste "typy" planów – na razie tylko do opisów / logiki
const PLANS = {
  FREE: "free",
  BASIC: "basic",
  PRO: "pro",
};

// --------------------
//  Usuwanie tła (remove.bg)
// --------------------
async function maybeRemoveBackground(b64, removeBackground) {
  if (!removeBackground) return { b64, applied: false };

  if (!REMOVEBG_API_KEY) {
    console.warn("⚠️ REMOVEBG_API_KEY missing – skip background removal");
    return { b64, applied: false };
  }

  try {
    const params = new URLSearchParams();
    // surowa base64 bez "data:image/..."
    params.append("image_file_b64", b64);
    params.append("size", "auto");
    params.append("format", "png"); // chcemy PNG z alfą

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
      // Jak coś pójdzie źle – lepiej mieć obraz z tłem niż żadnego
      return { b64, applied: false };
    }

    // remove.bg zwraca binarne PNG w body
    const arrayBuffer = await resp.arrayBuffer();
    const outB64 = Buffer.from(arrayBuffer).toString("base64");

    console.log("✅ remove.bg OK – background removed");
    return { b64: outB64, applied: true };
  } catch (e) {
    console.error("❌ remove.bg exception:", e);
    return { b64, applied: false };
  }
}

// --------------------
//  SZKIELET PAKIETÓW / LIMITÓW
// --------------------
//
// Tu kiedyś podepniesz bazę danych (Supabase / PlanetScale / Firestore / cokolwiek).
// Na razie ta funkcja tylko udaje "sprawdzenie pakietu" i zwraca strukturę,
// z której korzysta reszta kodu.
//
// WAŻNE: tu NIE MA prawdziwego liczenia kredytów – to tylko szkielet.
// --------------------
async function checkAndConsumeCredit(customer, options = {}) {
  const { removeBackgroundRequested } = options;

  if (!customer || !customer.id) {
    return {
      ok: false,
      reason: "NO_CUSTOMER",
    };
  }

  // 👉 TU W PRZYSZŁOŚCI:
  // 1. sprawdzasz w DB użytkownika (po customer.id lub email)
  // 2. odczytujesz jego plan: free / basic / pro
  // 3. sprawdzasz ile ma jeszcze generowań
  // 4. odejmujesz 1 kredit
  // 5. zapisujesz wynik w DB
  //
  // Na razie "na sztywno": każdy zalogowany user ma:
  // - plan FREE
  // - 1 darmowe generowanie (nie pilnujemy tego realnie, tylko opisowo)
  // - remove.bg: WYŁĄCZONE (canUseRemoveBg: false)

  const plan = PLANS.FREE;

  // Tu możesz np. zablokować, jak będziesz miał DB:
  // if (remaining <= 0) return { ok: false, reason: "NO_CREDITS", plan, remaining: 0 };

  const canUseRemoveBg = false; // <- w FREE nie pozwalamy na remove.bg
  const remaining = 0; // <- na razie tylko informacyjnie, bez realnego liczenia

  return {
    ok: true,
    plan,
    remaining,
    canUseRemoveBg,
    removeBackgroundAllowed: canUseRemoveBg && !!removeBackgroundRequested,
  };
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

  try:
    let body = req.body;
    if (typeof body === "string") {
      try {
        body = JSON.parse(body || "{}");
      } catch {
        body = {};
      }
    }

    const prompt = (body?.prompt || "").trim();
    const removeBackgroundRequested = !!body?.removeBackground;
    const customer = body?.customer || null; // <-- przychodzi z frontu (window.__aiCustomer)

    if (!prompt || prompt.length < 3) {
      return res.status(400).json({ error: "Prompt too short." });
    }

    if (!PRINTIFY_API_KEY) {
      console.error("PRINTIFY_API_TOKEN is missing");
      return res
        .status(500)
        .json({ error: "Server misconfigured: no PRINTIFY_API_TOKEN" });
    }

    // 0) PODWÓJNE ZABEZPIECZENIE: backend też wymaga zalogowanego usera
    if (!customer || !customer.id) {
      return res.status(401).json({ error: "Customer not authenticated" });
    }

    // 0.5) Sprawdzenie "pakietu" / kredytów
    const quota = await checkAndConsumeCredit(customer, {
      removeBackgroundRequested,
    });

    if (!quota.ok) {
      // tu w przyszłości możesz zwracać różne kody zależnie od reason
      if (quota.reason === "NO_CREDITS") {
        return res.status(402).json({
          error: "No credits left for this customer.",
          plan: quota.plan || null,
          remainingCredits:
            typeof quota.remaining === "number" ? quota.remaining : null,
        });
      }
      if (quota.reason === "NO_CUSTOMER") {
        return res.status(401).json({ error: "Customer not authenticated" });
      }

      return res.status(403).json({
        error: "Access denied by plan/credits.",
        reason: quota.reason || "UNKNOWN",
      });
    }

    const removeBackgroundEffective = !!quota.removeBackgroundAllowed;

    // 1) Generowanie obrazu w OpenAI
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

    // 2) Opcjonalne usuwanie tła przez remove.bg
    const bgResult = await maybeRemoveBackground(
      b64,
      removeBackgroundEffective
    );
    b64 = bgResult.b64;
    const removeBgApplied = bgResult.applied;

    // 3) Upload do Printify
    const uploadBody = {
      file_name: `ai-${Date.now()}.png`,
      contents: b64, // SAMA base64
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

    return res.status(200).json({
      ok: true,
      aiId,
      prompt,
      imageUrl,
      plan: quota.plan || null,
      remainingCredits:
        typeof quota.remaining === "number" ? quota.remaining : null,
      removeBackgroundRequested,
      removeBackgroundApplied: removeBgApplied,
    });
  } catch (err) {
    console.error("❌ generate-image-v3 error:", err);
    return res
      .status(500)
      .json({ error: err?.message || "Unknown server error" });
  }
}
