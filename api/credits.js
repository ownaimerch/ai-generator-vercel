// api/credits.js
import { getOrCreateUser } from "./credits-core.js";

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
  const email = req.query.email || null;

  if (!customerId) {
    return res.status(400).json({ error: "customer_id required" });
  }

  try {
    const user = await getOrCreateUser({ id: customerId, email });

    return res.status(200).json({
      ok: true,
      credits: user.credits ?? 0,
      freebie_used: !!user.freebie_used,
    });
  } catch (err) {
    console.error("credits api error:", err);
    return res
      .status(500)
      .json({ error: err?.message || "Internal server error" });
  }
}
