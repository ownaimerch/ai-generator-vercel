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

    const imageUrl = response.data[0].url;

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ imageUrl }),
    };
  } catch (err) {
    console.error("❌ OpenAI ERROR:", err);

    const fallback = {
      error:
        (err?.response?.data && typeof err.response.data === "string"
          ? err.response.data
          : err?.response?.data?.error?.message) ||
        err?.message ||
        "Unknown error",
    };

    return {
      statusCode: 500,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(fallback),
    };
  }
};
