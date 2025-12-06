// lib/credits.js
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.warn("⚠️ Supabase env vars missing (SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY)");
}

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: { persistSession: false },
});

// Ile kosztuje co:
export const CREDIT_COSTS = {
  GENERATE: 1,        // zwykła generacja
  REMOVE_BG_EXTRA: 1, // +1 jeśli removeBackground = true
};

// 1) Pobierz lub stwórz usera z 1 darmowym kredytem
export async function getOrCreateUser(customer) {
  if (!customer || !customer.id) {
    throw new Error("Missing customer.id");
  }

  const userId = Number(customer.id);

  // spróbuj znaleźć
  let { data, error } = await supabase
    .from("ai_users")
    .select("*")
    .eq("id", userId)
    .single();

  // PGRST116 = no rows
  if (error && error.code !== "PGRST116") {
    console.error("Supabase get user error:", error);
    throw error;
  }

  if (!data) {
    // nie ma – tworzymy z 1 darmowym kredytem
    const { data: inserted, error: insErr } = await supabase
      .from("ai_users")
      .insert({
        id: userId,
        email: customer.email || null,
        credits: 1, // FREEBIE = 1
      })
      .select("*")
      .single();

    if (insErr) {
      console.error("Supabase insert user error:", insErr);
      throw insErr;
    }
    data = inserted;
  }

  return data; // { id, email, credits, ... }
}

// 2) Obciąż kredyty po udanej generacji
export async function chargeCredits(userId, cost, meta = {}) {
  if (!userId) throw new Error("Missing userId");
  if (!cost || cost <= 0) return;

  userId = Number(userId);

  // Pobierz aktualny stan
  const { data: user, error: userErr } = await supabase
    .from("ai_users")
    .select("credits")
    .eq("id", userId)
    .single();

  if (userErr) {
    console.error("Supabase get credits error:", userErr);
    throw userErr;
  }

  if (!user || user.credits < cost) {
    const err = new Error("INSUFFICIENT_CREDITS");
    err.code = "INSUFFICIENT_CREDITS";
    throw err;
  }

  const newCredits = user.credits - cost;

  // Update kredytów
  const { error: updErr } = await supabase
    .from("ai_users")
    .update({ credits: newCredits, updated_at: new Date().toISOString() })
    .eq("id", userId);

  if (updErr) {
    console.error("Supabase update credits error:", updErr);
    throw updErr;
  }

  // Zaloguj użycie
  await supabase.from("ai_usage").insert({
    user_id: userId,
    type: meta.type || "generate",
    prompt: meta.prompt || null,
    cost,
  });

  return { remaining: newCredits };
}
