import { OpenAI } from "openai";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { prompt } = req.body;

    if (!prompt || prompt.trim().length < 3) {
      return res.status(400).json({ error: "Prompt too short." });
    }

    const response = await openai.images.generate({
      model: "dall-e-3",
      prompt,
      n: 1,
      size: "1024x1024",
      response_format: "url",
    });

    const imageUrl = response.data[0].url;

    return res.status(200).json({ imageUrl });
  } catch (err) {
    console.error("❌ OpenAI error:", err);
    return res.status(500).json({
      error:
        err?.response?.data?.error?.message ||
        err?.message ||
        "Unknown error",
    });
  }
}
