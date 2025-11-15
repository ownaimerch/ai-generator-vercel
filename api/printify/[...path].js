// api/printify/[...path].js
export default async function handler(req, res) {
  const token = process.env.PRINTIFY_API_TOKEN;
  if (!token) return res.status(500).json({ error: 'Missing PRINTIFY_API_TOKEN' });

  const path = (req.query.path || []);
  if (!Array.isArray(path) || path.length === 0) {
    return res.status(400).json({ error: 'Invalid path' });
  }

  const qs = new URLSearchParams(req.query);
  qs.delete('path'); // nie wysyłamy naszego parametru pomocniczego
  const url = `https://api.printify.com/v1/${path.join('/')}${qs.toString() ? `?${qs}` : ''}`;

  const r = await fetch(url, {
    method: req.method,
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: (req.method !== 'GET' && req.method !== 'HEAD') ? JSON.stringify(req.body || {}) : undefined,
  });

  const text = await r.text();
  let json;
  try { json = JSON.parse(text); } catch { return res.status(r.status).send(text); }

  // Pretty JSON?
  if (req.query.pretty === '1') {
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    return res.status(r.status).send(JSON.stringify(json, null, 2));
  }
  return res.status(r.status).json(json);
}
