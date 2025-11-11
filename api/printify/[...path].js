export default async function handler(req, res) {
  try {
    const token = process.env.PRINTIFY_API_TOKEN;
    if (!token) {
      return res.status(500).json({ error: 'Missing PRINTIFY_API_TOKEN' });
    }

    // catch-all: /api/printify/[...path]
    const segments = Array.isArray(req.query.path) ? req.query.path : [];
    const [root, ...rest] = segments;

    let url;

    // --- SHOPS --------------------------------------------------------------
    if (root === 'shops') {
      // GET https://api.printify.com/v1/shops.json
      url = 'https://api.printify.com/v1/shops.json';
    }

    // --- CATALOG ------------------------------------------------------------
    else if (root === 'catalog') {
      // Pozwalamy na dwie formy:
      // 1) /api/printify/catalog/blueprints.json?search=garment
      // 2) /api/printify/catalog?path=blueprints.json%3Fsearch%3Dgarment
      let pathFromQuery = req.query.path; // np. "blueprints.json?search=garment"
      let pathFromSegments = rest.join('/'); // np. "blueprints.json"

      let path = pathFromQuery || pathFromSegments || '';

      if (!path) {
        // domyślnie pokaż blueprints
        path = 'blueprints.json';
      }

      // Jeśli nie ma .json i nie ma zapytania – dołącz .json
      if (!path.includes('.json') && !path.includes('?')) {
        path += '.json';
      }

      url = `https://api.printify.com/v1/catalog/${path}`;
    }

    // --- NOT FOUND ----------------------------------------------------------
    else {
      return res.status(404).json({ error: 'Not found', path: segments });
    }

    const resp = await fetch(url, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/json',
      },
      // tylko GET na te dwie trasy
      method: 'GET',
    });

    const text = await resp.text();
    try {
      return res.status(resp.status).json(JSON.parse(text));
    } catch {
      // Gdy Printify zwróci nie-JSON (rzadko)
      return res.status(resp.status).send(text);
    }
  } catch (e) {
    return res.status(500).json({ error: e?.message || 'Internal error' });
  }
}
