import { OpenAI } from "openai";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Tylko POST dozwolony" });
  }

  const { prompt } = req.body;

  if (!prompt || prompt.trim().length < 3) {
    return res.status(400).json({ error: "Zbyt krótki opis" });
  }

  try {
    const response = await openai.images.generate({
      model: "dall-e-2",
      prompt,
      n: 1,
      size: "512x512",
    });

    const imageUrl = response.data[0].url;
    console.log("✅ Obraz wygenerowany:", imageUrl);
    res.status(200).json({ imageUrl });
  } catch (error) {
    console.error("❌ Błąd OpenAI:", error?.response?.data || error.message);
    res.status(500).json({
      error: error?.response?.data || error.message || "Nieznany błąd",
    });
  }
}
