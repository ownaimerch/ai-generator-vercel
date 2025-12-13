// api/credits.js
import { getOrCreateUser } from "./credits.js";

export default async function handler(req, res) {
  // CORS – tylko Twój sklep
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

  const customerId = req.query.customer_id;

  if (!customerId) {
    return res.status(400).json({ error: "customer_id required" });
  }

  try {
    // używamy tylko id – email nie jest potrzebny
    const user = await getOrCreateUser({ id: customerId, email: null });
    const credits = typeof user.credits === "number" ? user.credits : 0;

    return res.status(200).json({ credits });
  } catch (err) {
    console.error("credits api error:", err);
    return res
      .status(500)
      .json({ error: err?.message || "Internal server error" });
  }
}
// api/credits.js – HELPER, nie endpoint /api/credits
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.warn("⚠️ Supabase env vars missing (SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY)");
}

export const CREDIT_COSTS = {
  GENERATE: 1,
  GENERATE_WITH_BG_REMOVE: 3,
};

export const FREEBIE_CREDITS = 1;

export const supabase =
  supabaseUrl && supabaseKey ? createClient(supabaseUrl, supabaseKey) : null;

export async function getOrCreateUser(customer) {
  if (!supabase) {
    throw new Error("Supabase is not configured");
  }

  const id = Number(customer.id);
  const email = customer.email || null;

  // szukamy użytkownika
  const { data, error } = await supabase
    .from("ai_users")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (error) throw error;

  if (data) {
    // ewentualna aktualizacja maila
    if (email && data.email !== email) {
      await supabase
        .from("ai_users")
        .update({
          email,
          updated_at: new Date().toISOString(),
        })
        .eq("id", id);
    }
    return data;
  }

  // jeśli brak – tworzymy z 1 darmowym kredytem
  const { data: inserted, error: insertError } = await supabase
    .from("ai_users")
    .insert({
      id,
      email,
      credits: FREEBIE_CREDITS,
      freebie_used: false,
    })
    .select("*")
    .single();

  if (insertError) throw insertError;
  return inserted;
}

export async function chargeCredits({ customer, type, cost, prompt }) {
  if (!supabase) {
    throw new Error("Supabase is not configured");
  }

  const user = await getOrCreateUser(customer);
  const current = typeof user.credits === "number" ? user.credits : 0;

  if (current < cost) {
    const err = new Error("Not enough credits");
    err.code = "NOT_ENOUGH_CREDITS";
    throw err;
  }

  const newCredits = current - cost;

  // aktualizacja kredytów
  const { data: updated, error: updateError } = await supabase
    .from("ai_users")
    .update({
      credits: newCredits,
      updated_at: new Date().toISOString(),
    })
    .eq("id", user.id)
    .select("*")
    .single();

  if (updateError) throw updateError;

  // zapis do logu użycia
  const { error: logError } = await supabase.from("ai_usage").insert({
    user_id: user.id,
    type,
    prompt,
    cost,
  });

  if (logError) throw logError;

  // ZWRACAMY ile zostało
  return updated.credits;
}
