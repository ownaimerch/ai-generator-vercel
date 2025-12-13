// api/credits.js
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.warn("⚠️ Supabase env vars missing (SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY)");
}

const supabase = supabaseUrl && supabaseKey
  ? createClient(supabaseUrl, supabaseKey)
  : null;

// 1 token = normalna generacja
// 3 tokeny = generacja + remove.bg
export const CREDIT_COSTS = {
  generate: 1,
  generate_remove_bg: 3,
};

export async function getOrCreateUser({ id, email }) {
  if (!supabase) {
    throw new Error("Supabase is not configured");
  }
  if (!id) {
    throw new Error("User id is required");
  }

  // szukamy usera
  const { data: existing, error } = await supabase
    .from("ai_users")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (error) {
    console.error("Supabase getOrCreateUser error (select):", error);
    throw new Error("DB_ERROR");
  }

  // jak jest, to go zwracamy
  if (existing) {
    return existing;
  }

  // jak nie ma – tworzymy nowego z 0 kredytów i freebie_used = false (domyślnie)
  const { data, error: insertErr } = await supabase
    .from("ai_users")
    .insert({
      id,
      email: email || null,
      credits: 0, // pakiety będą dopłacać kredyty
      // freebie_used ma default false z migracji
    })
    .select("*")
    .single();

  if (insertErr) {
    console.error("Supabase getOrCreateUser error (insert):", insertErr);
    throw new Error("DB_ERROR");
  }

  return data;
}

/**
 * chargeCredits:
 * - 1) jeśli user ma jeszcze FREEBIE (freebie_used = false) -> ta generacja jest ZA DARMO (cost=0)
 * - 2) jeśli freebie już wykorzystane, sprawdzamy czy ma wystarczająco kredytów
 * - 3) zapisujemy nowy stan kredytów + log do ai_usage
 */
export async function chargeCredits(userId, type, prompt) {
  if (!supabase) throw new Error("Supabase is not configured");

  const baseCost =
    type === "generate_remove_bg"
      ? CREDIT_COSTS.generate_remove_bg
      : CREDIT_COSTS.generate;

  // wczytujemy aktualnego usera
  const { data: user, error: userErr } = await supabase
    .from("ai_users")
    .select("id, credits, freebie_used")
    .eq("id", userId)
    .single();

  if (userErr || !user) {
    console.error("chargeCredits: user fetch error:", userErr);
    throw new Error("USER_NOT_FOUND");
  }

  const currentCredits = user.credits ?? 0;

  let cost = baseCost;
  let finalType = type;
  let freebieJustUsed = false;

  // --- FREEBIE LOGIKA ---
  if (!user.freebie_used) {
    // ta pierwsza generacja jest za darmo
    cost = 0;
    finalType = "freebie_" + type; // np. 'freebie_generate'
    freebieJustUsed = true;
  } else {
    // freebie już poszło -> normalne zużywanie kredytów
    if (currentCredits < baseCost) {
      // specjalny kod błędu, żeby frontend mógł pokazać sensowny komunikat
      const msg =
        currentCredits <= 0
          ? "NOT_ENOUGH_CREDITS:0"
          : `NOT_ENOUGH_CREDITS:${currentCredits}`;
      throw new Error(msg);
    }
  }

  const newCredits = currentCredits - cost;

  // aktualizacja usera
  const updates = {
    credits: newCredits,
    updated_at: new Date().toISOString(),
  };
  if (freebieJustUsed) {
    updates.freebie_used = true;
  }

  const { error: updateErr } = await supabase
    .from("ai_users")
    .update(updates)
    .eq("id", userId);

  if (updateErr) {
    console.error("chargeCredits: update error:", updateErr);
    throw new Error("DB_ERROR");
  }

  // log użycia
  const { error: logErr } = await supabase.from("ai_usage").insert({
    user_id: userId,
    type: finalType,
    prompt: prompt || null,
    cost,
  });

  if (logErr) {
    console.error("chargeCredits: log insert error:", logErr);
    // nie przerywamy już – kredyty zostały odjęte, więc treat as success
  }

  return {
    cost,
    remainingCredits: newCredits,
    freebieUsed: freebieJustUsed || !!user.freebie_used,
  };
}

// OPTIONAL: endpoint GET /api/credits – zwraca stan kredytów (na potrzeby licznika w UI)
export default async function handler(req, res) {
  // proste CORS (tak jak w generate-image-v3)
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

  try {
    const idRaw = req.query.customerId;
    const email = req.query.email;

    const id = idRaw ? parseInt(String(idRaw), 10) : null;
    if (!id) {
      return res.status(400).json({ error: "customerId is required" });
    }

    const user = await getOrCreateUser({ id, email });

    return res.status(200).json({
      ok: true,
      userId: user.id,
      email: user.email,
      credits: user.credits ?? 0,
      freebieUsed: !!user.freebie_used,
    });
  } catch (err) {
    console.error("credits API error:", err);
    return res
      .status(500)
      .json({ error: err?.message || "Unknown server error" });
  }
}
