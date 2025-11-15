// /api/printify/create-product.js
// Tworzy draft produktu w Printify na bazie upload_id.
// Obsługuje wybór strony (front/back), kolory i rozmiary.

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const token = process.env.PRINTIFY_API_TOKEN;
  if (!token) return res.status(500).json({ error: 'PRINTIFY_API_TOKEN missing' });

  let body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;

  const {
    shop_id,               // Np. 22966546
    upload_id,             // Np. 6918998faed3097789b53916
    title = 'Test AI Tee',
    side = 'front',        // 'front' | 'back'
    colors = ['White','Black'],
    sizes  = ['S','M','L','XL'],
    price_cents = 1999,    // cena w centach
    publish = true         // opublikować od razu (mockupy)
  } = body || {};

  if (!shop_id)   return res.status(400).json({ error: 'shop_id is required' });
  if (!upload_id) return res.status(400).json({ error: 'upload_id is required' });

  // Stałe: Comfort Colors (706) + Printify Choice (99)
  const blueprint_id      = 706;
  const print_provider_id = 99;

  // Mapa wariantów (706 / provider 99) z Twojego odczytu:
  // White: S,M,L,XL -> 73199,73203,73207,73211
  // Black: S,M,L,XL -> 73196,73200,73204,73208
  const VARIANT_IDS = {
    White: { S: 73199, M: 73203, L: 73207, XL: 73211 },
    Black: { S: 73196, M: 73200, L: 73204, XL: 73208 },
  };

  // Print areas rozmiary (DTG – te, które podałeś):
  const PLACEHOLDER_SIZE = {
    S:  { w: 3703, h: 4200 },
    M:  { w: 4107, h: 4658 },
    L:  { w: 4494, h: 5097 },
    XL: { w: 4494, h: 5097 },
  };

  // Zbuduj listę wariantów i zgrupuj je w print_areas (front/back)
  const enabledVariants = [];
  const printAreaGroups = {}; // key by side: { variant_ids:[], placeholders:[{position, images:[...]}] }

  function ensureGroup(position) {
    if (!printAreaGroups[position]) {
      printAreaGroups[position] = { variant_ids: [], placeholders: [
        {
          position,
          // Printify przyjmuje obrazy z parametrami x,y,scale w [0..1] — centrowane, 100% to zwykle "na całą matrycę".
          images: [{ id: upload_id, x: 0.5, y: 0.5, scale: 1.0, angle: 0 }],
        },
      ]};
    }
    return printAreaGroups[position];
  }

  for (const color of colors) {
    const colorMap = VARIANT_IDS[color];
    if (!colorMap) continue;

    for (const size of sizes) {
      const variantId = colorMap[size];
      if (!variantId) continue;

      enabledVariants.push({
        id: variantId,
        price: price_cents, // cents
        is_enabled: true,
      });

      // wrzuć warianty do wskazanej strony nadruku
      const group = ensureGroup(side);
      group.variant_ids.push(variantId);
    }
  }

  if (enabledVariants.length === 0) {
    return res.status(400).json({ error: 'No matching variant ids for given colors/sizes' });
  }

  // Budowa payloadu produktu
  const productPayload = {
    title,
    description: '',
    blueprint_id,
    print_provider_id,
    variants: enabledVariants,
    print_areas: Object.values(printAreaGroups),
  };

  // 1) Stwórz draft produktu
  const createUrl = `https://api.printify.com/v1/shops/${shop_id}/products.json`;
  const r1 = await fetch(createUrl, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(productPayload),
  });

  const txt1 = await r1.text();
  let data1;
  try { data1 = JSON.parse(txt1); } catch { data1 = { raw: txt1 }; }

  if (!r1.ok) {
    return res.status(r1.status).json({ step: 'create', status: r1.status, data: data1 });
  }

  const productId = data1?.id;

  // 2) Publish (żeby pobrać mockupy) – opcjonalnie
  if (publish && productId) {
    const publishUrl = `https://api.printify.com/v1/shops/${shop_id}/products/${productId}/publish.json`;
    const r2 = await fetch(publishUrl, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ }),
    });
    const txt2 = await r2.text();
    let data2; try { data2 = JSON.parse(txt2); } catch { data2 = { raw: txt2 }; }

    // nawet jeśli publish zwróci async task — przekażemy to w odpowiedzi
    return res.status(200).json({ ok: true, created: data1, publish: { status: r2.status, data: data2 } });
  }

  return res.status(200).json({ ok: true, created: data1 });
}
