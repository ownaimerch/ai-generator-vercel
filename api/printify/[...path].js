export default async function handler(req, res) {
  try {
    // 1) Token z Vercela
    const token = process.env.PRINTIFY_API_TOKEN;
    if (!token) {
      return res.status(500).json({ error: 'Missing PRINTIFY_API_TOKEN' });
    }

    // 2) Wyciągamy segmenty po /api/printify/ z req.url (nie z req.query)
    const full = new URL(req.url, `http://${req.headers.host}`);
    const after = full.pathname.replace(/^\/api\/printify\/?/, ''); // "shops" | "catalog" | ""
    const segments = after ? after.split('/').filter(Boolean) : [];

    // 3) Router
    if (req.method === 'GET' && segments.length === 1 && segments[0] === 'shops') {
      const r = await fetch('https://api.printify.com/v1/shops.json', {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await r.json();
      return res.status(r.ok ? 200 : r.status).json(data);
    }

    if (req.method === 'GET' && segments.length === 1 && segments[0] === 'catalog') {
      // /api/printify/catalog?path=blueprints%3Fsearch%3Dgarment
      const path = full.searchParams.get('path');
      if (!path) {
        return res.status(400).json({ error: 'Missing query param "path", e.g. ?path=blueprints%3Fsearch%3Dgarment' });
      }

      // Zabezpieczenie przed wstrzykiwaniem ścieżek
      if (!/^[a-z0-9\-_/?.=&%]+$/i.test(path)) {
        return res.status(400).json({ error: 'Invalid path' });
      }

      const url = `https://api.printify.com/v1/catalog/${path}`;
      const r = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
      const data = await r.json();
      return res.status(r.ok ? 200 : r.status).json(data);
    }

    // Default
    return res.status(404).json({ error: 'Not found', segments });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Server error', details: String(err?.message || err) });
  }
}
