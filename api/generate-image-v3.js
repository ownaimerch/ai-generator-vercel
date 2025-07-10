const { OpenAI } = require("openai");

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

exports.handler = async (event) => {
  try {
    const body = JSON.parse(event.body);
    const prompt = body.prompt;

    if (!prompt || prompt.trim().length < 3) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: "Prompt too short." }),
      };
    }

    const response = await openai.images.generate({
      model: "dall-e-3",
      prompt,
      n: 1,
      size: "1024x1024",
      response_format: "url",
    });

    const imageUrl = response.data.data[0].url; // 👈 to było źle w Twojej wersji

    return {
      statusCode: 200,
      body: JSON.stringify({ imageUrl }),
    };
  } catch (err) {
  console.error("❌ OpenAI ERROR:", JSON.stringify(err, null, 2));

  const fallbackError =
    err?.response?.data?.error?.message ||
    err?.message ||
    "Unknown server error";

  return {
    statusCode: 500,
    body: JSON.stringify({ error: fallbackError }),
  };
}
};
