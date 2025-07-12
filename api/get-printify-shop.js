export default async function handler(req, res) {
  const PRINTIFY_API_TOKEN = process.env.PRINTIFY_API_TOKEN;

  try {
    const response = await fetch("https://api.printify.com/v1/shops.json", {
      headers: {
        Authorization: `Bearer ${PRINTIFY_API_TOKEN}`
      }
    });

    const data = await response.json();

    if (!response.ok) {
      return res.status(500).json({ error: "Nie udało się pobrać sklepów Printify.", details: data });
    }

    res.status(200).json({ shops: data });
  } catch (error) {
    res.status(500).json({ error: "Błąd serwera", details: error.message });
  }
}
