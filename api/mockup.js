// api/mockup.js

export default async function handler(req, res) {
  // ---------- CORS ----------
  const origin = req.headers.origin || "";
  const allowedOrigins = [
    "https://ownaimerch.com",
    "https://www.ownaimerch.com",
    // dodaj tu inne domeny, na których TESTUJESZ front,
    // np. podgląd motywu lub domenę myshopify:
    "https://ownaimerch.myshopify.com"
  ];

  if (allowedOrigins.includes(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
  }

  res.setHeader("Vary", "Origin");
  res.setHeader("Access-Control-Allow-Methods", "POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    // preflight – tutaj ma się kończyć, z tymi nagłówkami
    res.status(200).end();
    return;
  }
  // ---------- KONIEC CORS ----------

  // NA RAZIE BEZ SHARPA – tylko test:
  if (req.method !== "POST") {
    res.status(405).json({ ok: false, error: "Only POST allowed" });
    return;
  }

  res.status(200).json({ ok: true, message: "CORS works for mockup" });
}
