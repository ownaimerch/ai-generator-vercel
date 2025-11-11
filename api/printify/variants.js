export default async function handler(req, res) {
  try {
    const token = process.env.PRINTIFY_API_TOKEN;
    if (!token) return res.status(500).json({ error: "PRINTIFY_API_TOKEN missing" });

    const { blueprint_id, print_provider_id } = req.query;
    if (!blueprint_id || !print_provider_id)
      return res.status(400).json({ error: 'blueprint_id and print_provider_id are required' });

    const url = `https://api.printify.com/v1/catalog/blueprints/${encodeURIComponent(blueprint_id)}/print_providers/${encodeURIComponent(print_provider_id)}/variants.json`;

    const r = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    const text = await r.text();
    if (!r.ok) return res.status(r.status).send(text);

    res.setHeader('content-type', 'application/json');
    res.send(text);
  } catch (e) {
    res.status(500).json({ error: e.message || 'Unexpected error' });
  }
}
