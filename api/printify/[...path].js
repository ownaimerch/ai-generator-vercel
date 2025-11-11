// /api/printify/[...path].js
const BASE = 'https://api.printify.com/v1';

function getToken() {
  return process.env.PRINTIFY_API_TOKEN || '';
}

function json(res, code, data) {
  res.status(code).json(data);
}

async function pFetch(path, { method = 'GET', body } = {}) {
  const token = getToken();
  if (!token) throw new Error('Missing PRINTIFY_API_TOKEN');
  const headers = {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json',
  };
  const resp = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!resp.ok) {
    const text = await resp.text().catch(() => '');
    throw new Error(`Printify ${method} ${path} -> ${resp.status} ${text}`);
  }
  return resp.json();
}

export default async function handler(req, res) {
  try {
    const token = getToken();
    if (!token) return json(res, 401, { error: 'Not connected' });

    const parts = (req.query.path || []);
    const [resource] = parts;

    // GET /api/printify/shops
    if (req.method === 'GET' && resource === 'shops') {
      const data = await pFetch('/shops.json');
      return json(res, 200, data);
    }

    // GET /api/printify/blueprints?search=garment
    if (req.method === 'GET' && resource === 'blueprints') {
      const { search = '' } = req.query;
      const q = search ? `?search=${encodeURIComponent(search)}` : '';
      const data = await pFetch(`/catalog/blueprints.json${q}`);
      return json(res, 200, data);
    }

    // GET /api/printify/providers?blueprint_id=XXXX
    if (req.method === 'GET' && resource === 'providers') {
      const { blueprint_id } = req.query;
      if (!blueprint_id) return json(res, 400, { error: 'Missing blueprint_id' });
      const data = await pFetch(`/catalog/blueprints/${blueprint_id}/print_providers.json`);
      return json(res, 200, data);
    }

    // GET /api/printify/variants?blueprint_id=XXXX&print_provider_id=YYYY
    if (req.method === 'GET' && resource === 'variants') {
      const { blueprint_id, print_provider_id } = req.query;
      if (!blueprint_id || !print_provider_id) {
        return json(res, 400, { error: 'Missing blueprint_id or print_provider_id' });
      }
      const data = await pFetch(`/catalog/blueprints/${blueprint_id}/print_providers/${print_provider_id}/variants.json`);
      return json(res, 200, data);
    }

    // POST /api/printify/create-product
    // body: { shop_id, title, blueprint_id, print_provider_id, variants, print_areas, images }
    if (req.method === 'POST' && resource === 'create-product') {
      const { shop_id, title, blueprint_id, print_provider_id, variants, print_areas, images } = req.body || {};
      if (!shop_id || !title || !blueprint_id || !print_provider_id || !variants || !print_areas) {
        return json(res, 400, { error: 'Missing required fields' });
      }
      const payload = {
        title,
        blueprint_id,
        print_provider_id,
        variants,     // [{variant_id, price, is_enabled}, ...]
        print_areas,  // [{variant_ids:[...], placeholders:[{position:'front', images:[{src, scale, x, y, angle}]}]}]
        images: images || [], // optional display images
        description: '',
        tags: [],
        options: {},
      };
      const created = await pFetch(`/shops/${shop_id}/products.json`, {
        method: 'POST',
        body: payload,
      });
      return json(res, 200, created);
    }

    return json(res, 404, { error: 'Not found', path: parts });
  } catch (e) {
    return json(res, 500, { error: e.message });
  }
}
