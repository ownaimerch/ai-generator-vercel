// api/credits-core.js
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.warn(
    "⚠️ Supabase env vars missing (SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY)"
  );
}

export const CREDIT_COSTS = {
  GENERATE: 1,
  GENERATE_WITH_BG_REMOVE: 3,
};

export const FREEBIE_CREDITS = 1;

export const supabase =
  supabaseUrl && supabaseServiceKey
    ? createClient(supabaseUrl, supabaseServiceKey)
    : null;

export async function getOrCreateUser({ id, email }) {
  if (!supabase) {
    throw new Error("Supabase is not configured");
  }

  const userId = Number(id);

  // szukamy usera
  const { data, error } = await supabase
    .from("ai_users")
    .select("*")
    .eq("id", userId)
    .maybeSingle();

  if (error) throw error;

  if (data) {
    // ewentualnie aktualizujemy maila
    if (email && data.email !== email) {
      await supabase
        .from("ai_users")
        .update({
          email,
          updated_at: new Date().toISOString(),
        })
        .eq("id", userId);
    }

    return data;
  }

  // jak nie ma – tworzymy z darmowym freebie
  const { data: inserted, error: insertError } = await supabase
    .from("ai_users")
    .insert({
      id: userId,
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

  const user = await getOrCreateUser({
    id: customer.id,
    email: customer.email || null,
  });

  const current =
    typeof user.credits === "number" && !Number.isNaN(user.credits)
      ? user.credits
      : 0;

  if (current < cost) {
    const err = new Error("Not enough credits");
    err.code = "NOT_ENOUGH_CREDITS";
    throw err;
  }

  const newCredits = current - cost;

  const { data: updated, error: updateError } = await supabase
    .from("ai_users")
    .update({
      credits: newCredits,
      updated_at: new Date().toISOString(),
      // bardzo prosty flag freebie
      freebie_used: user.freebie_used || current <= FREEBIE_CREDITS,
    })
    .eq("id", user.id)
    .select("*")
    .single();

  if (updateError) throw updateError;

  const { error: logError } = await supabase.from("ai_usage").insert({
    user_id: user.id,
    type,
    prompt,
    cost,
  });

  if (logError) throw logError;

  // zwracamy ile zostało
  return updated.credits;
}
