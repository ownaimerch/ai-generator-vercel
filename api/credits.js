// api/credits.js
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.warn("⚠️ Supabase env vars missing (SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY)");
}

const supabase =
  supabaseUrl && supabaseServiceKey
    ? createClient(supabaseUrl, supabaseServiceKey, {
        auth: { persistSession: false },
      })
    : null;

// ---------------- KOSZTY KREDYTÓW ----------------

export const CREDIT_COSTS = {
  GENERATE: 1,                // zwykła generacja
  GENERATE_WITH_BG_REMOVE: 3, // generacja + remove.bg
};

// ---------------- HELPERY DLA GENERATE-IMAGE ----------------

export async function getOrCreateUser(customer) {
  if (!supabase) {
    throw new Error("Supabase not configured");
  }
  if (!customer || !customer.id) {
    throw new Error("customer.id is required");
  }

  const id = Number(customer.id);
  const email = customer.email || null;

  // spróbuj znaleźć istniejącego
  const { data, error } = await supabase
    .from("ai_users")
    .select("*")
    .eq("id", id)
    .limit(1)
    .single()
    .catch((e) => {
      // supabase-js czasem rzuca przy single() gdy brak rekordu
      if (e?.code === "PGRST116") return { data: null, error: null };
      throw e;
    });

  if (error) {
    console.error("Supabase get user error:", error);
    throw error;
  }

  if (data) return data;

  // brak – zakładamy nowy rekord z freebie_unused
  const { data: inserted, error: insertError } = await supabase
    .from("ai_users")
    .insert({
      id,
      email,
      credits: 0,
      freebie_used: false,
    })
    .select()
    .single();

  if (insertError) {
    console.error("Supabase insert user error:", insertError);
    throw insertError;
  }

  return inserted;
}

export async function chargeCredits({ customer, type, cost, prompt }) {
  if (!supabase) {
    throw new Error("Supabase not configured");
  }
  if (!customer || !customer.id) {
    throw new Error("customer.id is required");
  }

  const id = Number(customer.id);

  // bierzemy aktualny stan usera
  const { data: user, error: selError } = await supabase
    .from("ai_users")
    .select("*")
    .eq("id", id)
    .limit(1)
    .single();

  if (selError) {
    console.error("Supabase select user error:", selError);
    throw selError;
  }

  let credits = user.credits ?? 0;
  let freebie_used = user.freebie_used ?? false;

  let finalCost = cost;
  let usedFreebieNow = false;

  // freebie: jeśli jeszcze NIE użyta i brak kredytów → ta generacja za 0
  if (!freebie_used && credits === 0) {
    finalCost = 0;
    usedFreebieNow = true;
  }

  // jeśli jednak trzeba pobrać kredyty i nie starcza
  if (finalCost > 0 && credits < finalCost) {
    const err = new Error("Not enough credits");
    err.code = "NOT_ENOUGH_CREDITS";
    throw err;
  }

  const newCredits = credits - finalCost;

  const { data: updated, error: updError } = await supabase
    .from("ai_users")
    .update({
      credits: newCredits,
      freebie_used: freebie_used || usedFreebieNow,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .select()
    .single();

  if (updError) {
    console.error("Supabase update user error:", updError);
    throw updError;
  }

  // log użycia (nie musi blokować odpowiedzi)
  try {
    await supabase.from("ai_usage").insert({
      user_id: id,
      type,
      prompt: prompt || null,
      cost: finalCost,
    });
  } catch (logErr) {
    console.warn("Supabase usage log error:", logErr);
  }

  return updated;
}

// ---------------- API ENDPOINT: GET /api/credits ----------------

export default async function handler(req, res) {
  // CORS (dla frontu z ownaimerch.com)
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

  if (!supabase) {
    return res.status(500).json({ error: "Supabase not configured" });
  }

  // obsługujemy kilka nazw parametru na wszelki wypadek
  const rawId =
    (req.query.customer_id ||
      req.query.customerId ||
      req.query.user_id ||
      "").toString();

  if (!rawId) {
    return res.status(400).json({ error: "customer_id is required" });
  }

  const id = Number.parseInt(rawId, 10);
  if (!Number.isFinite(id)) {
    return res.status(400).json({ error: "Invalid customer_id" });
  }

  try {
    const { data, error } = await supabase
      .from("ai_users")
      .select("id, credits, freebie_used")
      .eq("id", id)
      .limit(1)
      .single()
      .catch((e) => {
        if (e?.code === "PGRST116") return { data: null, error: null };
        throw e;
      });

    if (error) {
      console.error("Supabase credits select error:", error);
      return res.status(500).json({ error: "Database error" });
    }

    if (!data) {
      // użytkownik jeszcze nic nie robił → 0 kredytów, freebie dostępne
      return res.status(200).json({
        ok: true,
        credits: 0,
        freebie_used: false,
        freebie_available: true,
      });
    }

    return res.status(200).json({
      ok: true,
      credits: data.credits ?? 0,
      freebie_used: !!data.freebie_used,
      freebie_available: !data.freebie_used,
    });
  } catch (err) {
    console.error("credits handler error:", err);
    return res
      .status(500)
      .json({ error: err?.message || "Unknown credits error" });
  }
}
