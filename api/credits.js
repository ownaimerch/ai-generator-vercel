// api/credits.js
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.SUPABASE_URL || "";
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "";

let supabase = null;
if (supabaseUrl && supabaseServiceKey) {
  supabase = createClient(supabaseUrl, supabaseServiceKey, {
    auth: { persistSession: false }
  });
} else {
  console.warn(
    "⚠️ Supabase env vars missing (SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY)"
  );
}

// stałe kosztów w tokenach
export const CREDIT_COSTS = {
  GENERATE: 1,
  GENERATE_WITH_BG_REMOVE: 3
};

// pomocniczo – wyciąga lub tworzy usera
export async function getOrCreateUser({ id, email }) {
  if (!supabase) {
    throw new Error("Supabase client is not configured.");
  }

  const userId = Number(id);
  if (!Number.isFinite(userId)) {
    throw new Error("Invalid customer id: " + id);
  }

  // szukamy usera
  const { data, error } = await supabase
    .from("ai_users")
    .select("*")
    .eq("id", userId)
    .limit(1);

  if (error) {
    console.error("ai_users select error:", error);
    throw error;
  }

  if (data && data.length > 0) {
    return data[0];
  }

  // nie ma – tworzymy
  const { data: inserted, error: insertError } = await supabase
    .from("ai_users")
    .insert([
      {
        id: userId,
        email: email || null,
        credits: 0,
        freebie_used: false
      }
    ])
    .select("*")
    .single();

  if (insertError) {
    console.error("ai_users insert error:", insertError);
    throw insertError;
  }

  return inserted;
}

// pobiera tokeny; obsługa freebie i logu użycia
export async function chargeCredits({ customer, type, cost, prompt }) {
  if (!supabase) {
    throw new Error("Supabase client is not configured.");
  }

  const user = await getOrCreateUser({
    id: customer.id,
    email: customer.email || null
  });

  let effectiveCost = cost;
  let usedFreebieNow = false;

  // jeśli user jeszcze nie wykorzystał freebie – to ta generacja jest za darmo
  if (!user.freebie_used) {
    effectiveCost = 0;
    usedFreebieNow = true;
  }

  if (user.credits < effectiveCost) {
    const err = new Error("Not enough credits");
    err.code = "NOT_ENOUGH_CREDITS";
    throw err;
  }

  const newCredits = user.credits - effectiveCost;

  const { data: updated, error: updateError } = await supabase
    .from("ai_users")
    .update({
      credits: newCredits,
      freebie_used: usedFreebieNow ? true : user.freebie_used,
      updated_at: new Date().toISOString()
    })
    .eq("id", user.id)
    .select("*")
    .single();

  if (updateError) {
    console.error("ai_users update error:", updateError);
    throw updateError;
  }

  // log użycia – nawet jak się wywali, to nie blokujemy użytkownika
  const { error: logError } = await supabase.from("ai_usage").insert([
    {
      user_id: user.id,
      type,
      cost: effectiveCost,
      prompt: prompt || null
    }
  ]);

  if (logError) {
    console.error("ai_usage insert error:", logError);
  }

  return newCredits; // tyle zostało
}

// HTTP handler: GET /api/credits
export default async function handler(req, res) {
  // CORS – na razie szeroko dla świętego spokoju
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Access-Control-Max-Age", "86400");

  if (req.method === "OPTIONS") {
    return res.status(204).end();
  }

  if (req.method !== "GET") {
    return res.status(405).json({ error: "Use GET" });
  }

  const customerId = req.query.customer_id;
  const email = (req.query.email || "").toString() || null;

  if (!customerId) {
    return res.status(400).json({ error: "Missing customer_id" });
  }

  if (!supabase) {
    return res.status(500).json({ error: "Supabase is not configured." });
  }

  try {
    const user = await getOrCreateUser({ id: customerId, email });

    return res.status(200).json({
      ok: true,
      credits: user.credits,
      freebie_used: !!user.freebie_used
    });
  } catch (err) {
    console.error("credits handler error:", err);
    return res
      .status(500)
      .json({ error: err.message || "Failed to load credits" });
  }
}
