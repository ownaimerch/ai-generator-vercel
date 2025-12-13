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
