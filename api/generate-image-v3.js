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

    const response = await openai.chat.completions.create({
      model: "gpt-4-vision-preview",
      messages: [
        {
          role: "user",
          content: [
            {
              type: "text",
              text: `Create a DALL·E 3 image: ${prompt}`,
            },
          ],
        },
      ],
      tools: [
        {
          type: "function",
          function: {
            name: "generate_image",
            parameters: {
              prompt,
              size: "1024x1024",
              n: 1,
            },
          },
        },
      ],
      tool_choice: { type: "function", function: { name: "generate_image" } },
    });

    const imageUrl = response.choices[0]?.message?.tool_calls?.[0]?.function?.arguments?.url;

    if (!imageUrl) {
      throw new Error("No image URL returned.");
    }

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ imageUrl }),
    };
  } catch (err) {
    console.error("❌ OpenAI ERROR:", err);

    return {
      statusCode: 500,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        error:
          err?.response?.data?.error?.message ||
          err?.message ||
          "Unknown error",
      }),
    };
  }
};
