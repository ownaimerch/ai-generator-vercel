export default async function handler(req, res) {
  const { path = '' } = req.query; // np. "blueprints?search=garment"
  try {
    const r = await fetch(`https://api.printify.com/v1/catalog/${path}`, {
      headers: { Authorization: `Bearer ${process.env.PRINTIFY_API_TOKEN}` }
    });
    const data = await r.json();
    res.status(r.ok ? 200 : r.status).json(data);
  } catch (e) {
    res.status(500).json({ error: 'catalog_failed', details: String(e) });
  }
}
