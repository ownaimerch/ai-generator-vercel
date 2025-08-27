// api/ping.js — prosty test CORS (bez OpenAI)
export default async function handler(req, res) {
  const origin = req.headers.origin || "";
  // na czas testu pozwalamy wszystkim (żeby wykluczyć CORS)
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(204).end();

  return res.status(200).json({
    ok: true,
    method: req.method,
    originSeen: origin || "null/empty",
  });
}
