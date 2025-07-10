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
    const chatResponse = await openai.chat.completions.create({
      model: "gpt-4-turbo",
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: `Wygeneruj obraz na podstawie tego opisu: ${prompt}` }
          ],
        },
      ],
      tools: [
        {
          type: "function",
          function: {
            name: "generate_image",
            description: "Generuje obraz DALL·E 3",
            parameters: {
              type: "object",
              properties: {
                prompt: { type: "string" }
              },
              required: ["prompt"]
            }
          }
        }
      ],
      tool_choice: "auto"
    });

    const imageGenCall = chatResponse.tool_calls?.[0]?.function;
    const imagePrompt = JSON.parse(imageGenCall.arguments).prompt;

    const imageResponse = await openai.images.generate({
      model: "dall-e-3",
      prompt: imagePrompt,
      n: 1,
      size: "1024x1024"
    });

    const imageUrl = imageResponse.data[0].url;
    console.log("✅ Obraz DALL·E 3 wygenerowany:", imageUrl);
    res.status(200).json({ imageUrl });
  } catch (error) {
    console.error("❌ Błąd DALL·E 3:", error?.response?.data || error.message);
    res.status(500).json({
      error: error?.response?.data || error.message || "Nieznany błąd",
    });
  }
}
