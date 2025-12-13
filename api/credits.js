// api/credits.js
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.warn(
    "⚠️ Supabase env vars missing (SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY)"
  );
}

export const CREDIT_COSTS = {
  generate: 1,              // samo generowanie
  "generate+remove_bg": 3,  // generowanie + remove.bg
};

const supabase =
  SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY
    ? createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
        auth: { persistSession: false },
      })
    : null;

// --- UŻYTKOWNIK ---

export async function getOrCreateUser(customer) {
  if (!supabase) throw new Error("Supabase not configured");
  if (!customer || typeof customer.id === "undefined") {
    throw new Error("Missing customer.id");
  }

  const id = Number(customer.id);
  const email = customer.email || null;

  // Szukamy istniejącego usera
  const { data, error } = await supabase
    .from("ai_users")
    .select("*")
    .eq("id", id)
    .limit(1);

  if (error) {
    console.error("Supabase select ai_users error:", error);
    throw error;
  }

  if (data && data.length > 0) {
    return data[0];
  }

  // Nowy user – 1 darmowy kredyt
  const { data: inserted, error: insertError } = await supabase
    .from("ai_users")
    .insert({
      id,
      email,
      credits: 1,
    })
    .select("*")
    .single();

  if (insertError) {
    console.error("Supabase insert ai_users error:", insertError);
    throw insertError;
  }

  return inserted;
}

// --- KREDYTY ---

// Obsługujemy 2 warianty wywołania:
// chargeCredits(userId, type, cost, prompt)
// chargeCredits(userId, type, prompt)
export async function chargeCredits(userId, type, costOrPrompt, maybePrompt) {
  if (!supabase) throw new Error("Supabase not configured");

  let cost;
  let prompt;

  if (typeof costOrPrompt === "number") {
    cost = costOrPrompt;
    prompt = maybePrompt || null;
  } else {
    cost = CREDIT_COSTS[type] ?? CREDIT_COSTS.generate;
    prompt = costOrPrompt || null;
  }

  const { data: user, error: userError } = await supabase
    .from("ai_users")
    .select("*")
    .eq("id", userId)
    .single();

  if (userError) {
    console.error("Supabase select ai_users error:", userError);
    throw userError;
  }

  if (!user || typeof user.credits !== "number" || user.credits < cost) {
    const err = new Error("Not enough credits");
    err.code = "NO_CREDITS";
    err.creditsLeft = user ? user.credits : 0;
    throw err;
  }

  const newCredits = user.credits - cost;

  const { error: updateError } = await supabase
    .from("ai_users")
    .update({ credits: newCredits })
    .eq("id", userId);

  if (updateError) {
    console.error("Supabase update ai_users error:", updateError);
    throw updateError;
  }

  const { error: logError } = await supabase.from("ai_usage").insert({
    user_id: userId,
    type,
    cost,
    prompt: prompt || null,
  });

  if (logError) {
    console.error("Supabase insert ai_usage error:", logError);
    // nie przerywamy – kredyty już zeszły
  }

  return { creditsLeft: newCredits };
}

// --- HTTP endpoint: GET /api/credits ---
// użyjemy go z frontendu do pokazania licznika
export default async function handler(req, res) {
  // CORS – pozwalamy na wywołanie z ownaimerch.com
  res.setHeader("Access-Control-Allow-Origin", "https://ownaimerch.com");
  res.setHeader("Access-Control-Allow-Methods", "GET,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Access-Control-Max-Age", "86400");

  if (req.method === "OPTIONS") {
    return res.status(204).end();
  }

  if (req.method !== "GET") {
    return res.status(405).json({ error: "Use GET" });
  }

  try {
    if (!supabase) {
      return res.status(500).json({ error: "Supabase not configured" });
    }

    const customerId =
      Number(req.query.customerId) ||
      Number(req.body && req.body.customerId);

    const email =
      (typeof req.query.email === "string" && req.query.email) ||
      (req.body && req.body.email) ||
      null;

    if (!customerId) {
      return res.status(400).json({ error: "customerId required" });
    }

    const user = await getOrCreateUser({ id: customerId, email });

    return res.status(200).json({
      ok: true,
      userId: user.id,
      email: user.email,
      credits: user.credits,
    });
  } catch (err) {
    console.error("credits handler error:", err);
    return res
      .status(500)
      .json({ error: err.message || "Unknown server error" });
  }
}
