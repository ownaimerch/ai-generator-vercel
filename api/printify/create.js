// api/printify/create.js
const SHOP_ID = 22966546;
const BLUEPRINT_ID = 706;
const PRINT_PROVIDER_ID = 99;

// 8 wybranych wariantów (White/Black S–XL)
const VARIANTS = {
  white: { S: 73199, M: 73203, L: 73207, XL: 73211 },
  black: { S: 73196, M: 73200, L: 73204, XL: 73208 },
};

// najmniejsze pole nadruku (pasuje do wszystkich)
const BASE_PLACEHOLDER = { width: 3703, height: 4200 };

function pretty(res, status, payload, enable) {
  if (enable) {
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    return res.status(status).send(JSON.stringify(payload, null, 2));
  }
  return res.status(status).json(payload);
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return pretty(res, 405, { error: 'Method not allowed' }, req.query.pretty === '1');
  }

  const token = process.env.PRINTIFY_API_TOKEN;
  if (!token) return pretty(res, 500, { error: 'Missing PRINTIFY_API_TOKEN' }, req.query.pretty === '1');

  // body: { title?, description?, imageUrl, side, sizes?, colors? }
  const {
    title = 'AI Tee',
    description = 'Personalized AI-generated design',
    imageUrl,
    side = 'front', // 'front' | 'back'
    sizes = ['S','M','L','XL'],
    colors = ['White','Black'],
    publish = false, // true => publish product in store
    price_cents // opcjonalnie: nadpisz cenę w centach
  } = req.body || {};

  if (!imageUrl) return pretty(res, 400, { error: 'imageUrl is required' }, req.query.pretty === '1');
  if (!['front','back'].includes(side)) return pretty(res, 400, { error: 'side must be "front" or "back"' }, req.query.pretty === '1');

  // 1) Upload grafiki do Printify (po URL)
  const upRes = await fetch('https://api.printify.com/v1/uploads/images.json', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      file_url: imageUrl,
      // Printify dopuszcza też "convert_to_printify_green": true itp. – pomijamy
    }),
  });
  const uploadJson = await upRes.json();
  if (!upRes.ok) {
    return pretty(res, upRes.status, { error: 'Upload failed', details: uploadJson }, req.query.pretty === '1');
  }
  const uploadId = uploadJson.id;

  // 2) Zbuduj listę variant_id wg wybranych kolorów/rozmiarów
  const pick = [];
  for (const color of colors) {
    const key = color.toLowerCase();
    if (!VARIANTS[key]) continue;
    for (const size of sizes) {
      const vId = VARIANTS[key][size];
      if (vId) pick.push(vId);
    }
  }
  if (pick.length === 0) return pretty(res, 400, { error: 'No variant_ids selected' }, req.query.pretty === '1');

  // 3) Opcjonalna cena: jedna dla wszystkich wariantów
  const variantsPayload = pick.map(id => ({
    variant_id: id,
    // price w centach – np. 1999 => 19.99
    ...(price_cents ? { price: price_cents } : {})
  }));

  // 4) Jedno „print_area” (front albo back) ze środkiem i stałym rozmiarem (BASE_PLACEHOLDER)
  // Printify oczekuje listy "print_areas" – ustawimy jeden obszar wspólny dla wszystkich wariantów.
  const printAreas = [{
    variant_ids: pick,
    placeholders: [{
      position: side,
      images: [{
        id: uploadId,
        // Prosty, stabilny układ: obraz wgrywamy w docelowym BASE_PLACEHOLDER (3703x4200)
        // i ustawiamy pełne pokrycie pola (x=0, y=0, scale=1). Jeśli chcesz marginesy – zmień scale / x / y.
        x: 0,
        y: 0,
        scale: 1,
        angle: 0
      }]
    }]
  }];

  // 5) Wywołanie create product
  const createBody = {
    title,
    description,
    blueprint_id: BLUEPRINT_ID,
    print_provider_id: PRINT_PROVIDER_ID,
    variants: variantsPayload,
    print_areas: printAreas,
    // możesz dodać "tags", "images" (mockup positions), itp.
  };

  const createRes = await fetch(`https://api.printify.com/v1/shops/${SHOP_ID}/products.json`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(createBody),
  });
  const createJson = await createRes.json();
  if (!createRes.ok) {
    return pretty(res, createRes.status, { error: 'Create product failed', details: createJson }, req.query.pretty === '1');
  }

  // 6) (Opcjonalnie) Publish product, żeby były mockupy i oferta w sklepie
  let publishJson;
  if (publish) {
    const pubRes = await fetch(`https://api.printify.com/v1/shops/${SHOP_ID}/products/${createJson.id}/publish.json`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        title: true, description: true, images: true, variants: true, tags: true
      }),
    });
    publishJson = await pubRes.json();
  }

  return pretty(res, 200, {
    ok: true,
    product: createJson,
    ...(publish ? { publish: publishJson } : {}),
    note: 'Product created with centered, fixed-size print area based on the smallest placeholder'
  }, req.query.pretty === '1');
}
