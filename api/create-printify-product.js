export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Only POST requests allowed" });
  }

  const { image_url, prompt } = req.body;
  const PRINTIFY_API_TOKEN = process.env.PRINTIFY_API_TOKEN;
  const SHOP_ID = "22966546"; // Twój shop_id z Printify

  const blueprint_id = 5; // Gildan 5000 T-shirt
  const print_provider_id = 1; // Printify jako dostawca

  try {
    // 1. Przygotuj payload do utworzenia produktu
    const payload = {
      title: "Your AI-generated T-shirt",
      description: "Generated with your imagination and AI ✨",
      blueprint_id,
      print_provider_id,
      variants: [
        // przykładowe rozmiary i kolory
        { id: 40118, is_enabled: true }, // White / S
        { id: 40119, is_enabled: true }, // White / M
        { id: 40120, is_enabled: true }, // White / L
        { id: 40121, is_enabled: true }  // White / XL
      ],
      print_areas: [
        {
          variant_ids: [40118, 40119, 40120, 40121],
          placeholders: [
            {
              position: "front",
              images: [
                {
                  src: image_url,
                  x: 0.5,
                  y: 0.5,
                  scale: 1,
                  angle: 0
                }
              ]
            }
          ]
        }
      ],
      is_visible: false, // nie publikujemy do Shopify!
    };

    // 2. Wyślij do Printify
    const createProductRes = await fetch(`https://api.printify.com/v1/shops/${SHOP_ID}/products.json`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${PRINTIFY_API_TOKEN}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(payload)
    });

    const productData = await createProductRes.json();

    if (!createProductRes.ok) {
      return res.status(500).json({ error: "Błąd tworzenia produktu", details: productData });
    }

    // 3. Zwróć mockup i ID produktu
    const mockup_url = productData?.images?.[0]?.src;

    return res.status(200).json({
      success: true,
      product_id: productData.id,
      mockup_url,
      prompt
    });
  } catch (err) {
    return res.status(500).json({ error: "Błąd serwera", details: err.message });
  }
}
