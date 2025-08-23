export default async function handler(req, res) {
  const access = (req.headers.cookie || '')
    .split('; ').find(c => c.startsWith('pfy_access='))?.split('=')[1];

  if (!access) return res.status(401).json({ error: 'Not connected' });

  const r = await fetch('https://api.printify.com/v1/shops.json', {
    headers: { Authorization: `Bearer ${decodeURIComponent(access)}`, 'User-Agent': 'OwnAiMerch' }
  });
  const data = await r.json();
  res.status(r.ok ? 200 : 400).json(data);
}
