// api/credits.js
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

// Prosty log pomocniczy, ale bez wypluwania kluczy
if (!supabaseUrl || !serviceRoleKey) {
  console.warn("⚠️ Supabase env vars missing in /api/credits:", {
    hasUrl: !!supabaseUrl,
    hasServiceRole: !!serviceRoleKey,
  });
}

const supabase = supabaseUrl && serviceRoleKey
  ? createClient(supabaseUrl, serviceRoleKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    })
  : null;

export default async function handler(req, res) {
  // --- CORS (sklep + preview) ---
  const origin = req.headers.origin || "";
  const allowedOrigins = [
    "https://ownaimerch.com",
    "https://www.ownaimerch.com",
    "https://ownaimerch.myshopify.com",
  ];
  if (allowedOrigins.includes(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
  }
  res.setHeader("Vary", "Origin");
  res.setHeader("Access-Control-Allow-Methods", "GET,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    return res.status(204).end();
  }

  if (req.method !== "GET") {
    return res.status(405).json({ ok: false, error: "Use GET" });
  }

  if (!supabase) {
    return res
      .status(500)
      .json({ ok: false, error: "Supabase not configured on server" });
  }

  // --- customer_id z query ---
  const rawId = req.query.customer_id;
  const customerId = parseInt(rawId, 10);

  if (!rawId || Number.isNaN(customerId)) {
    return res
      .status(400)
      .json({ ok: false, error: "Missing or invalid customer_id" });
  }

  try {
    // Czytamy kredyty z ai_users (ta sama tabela, co przy generatorze)
    const { data, error } = await supabase
      .from("ai_users")
      .select("credits, freebie_used")
      .eq("id", customerId)
      .single();

    if (error) {
      console.error("❌ /api/credits supabase error:", error);
      return res.status(500).json({ ok: false, error: "DB error" });
    }

    const credits = data?.credits ?? 0;
    const freebieUsed = !!data?.freebie_used;

    return res.status(200).json({
      ok: true,
      credits,
      freebie_used: freebieUsed,
    });
  } catch (err) {
    console.error("❌ /api/credits unexpected error:", err);
    return res
      .status(500)
      .json({ ok: false, error: "Unexpected server error" });
  }
}
