export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });
  const token = process.env.PRINTIFY_API_TOKEN;
  try {
    const {
      shopId,
      title,
      description = '',
      blueprintId,
      printProviderId,
      variantIds,            // [123, 124, ...] – S,M,L,XL dla kolorów
      imageUrl,              // URL obrazu z DALL·E
      printPosition = 'front', // 'front' | 'back'
      priceCents = 2499      // domyślna cena w centach
    } = await req.json();

    if (!shopId || !blueprintId || !printProviderId || !Array.isArray(variantIds) || !imageUrl) {
      return res.status(400).json({ error: 'missing_fields' });
    }

    // 1) Upload obrazu do Printify – dostaniemy upload.id
    const up = await fetch(`https://api.printify.com/v1/uploads/images.json`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ url: imageUrl })
    });
    const upJson = await up.json();
    if (!up.ok) return res.status(up.status).json({ error: 'upload_failed', details: upJson });

    const uploadId = upJson.id;

    // 2) Zbuduj produkt (draft)
    const payload = {
      title,
      description,
      blueprint_id: blueprintId,
      print_provider_id: printProviderId,
      variants: variantIds.map(id => ({
        id,
        price: priceCents,
        is_enabled: true
      })),
      print_areas: [
        {
          variant_ids: variantIds,
          placeholders: [
            {
              position: printPosition,
              images: [
                {
                  id: uploadId,
                  // domyślne centrowanie i skala ~50% – możesz potem dopieścić
                  x: 0.5,
                  y: 0.5,
                  scale: 0.5,
                  angle: 0
                }
              ]
            }
          ]
        }
      ]
    };

    const r = await fetch(`https://api.printify.com/v1/shops/${shopId}/products.json`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    const data = await r.json();
    if (!r.ok) return res.status(r.status).json({ error: 'create_failed', details: data });

    // 3) Zwracamy ID draftu i link do produktu w Printify
    return res.status(200).json({ ok: true, product: data });
  } catch (e) {
    return res.status(500).json({ error: 'create_exception', details: String(e) });
  }
}
