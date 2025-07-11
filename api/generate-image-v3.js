const { OpenAI } = require("openai");

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

exports.handler = async (event) => {
  try {
    const { prompt } = JSON.parse(event.body || "{}");

    if (!prompt || prompt.trim().length < 3) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: "Prompt too short." }),
      };
    }

    const chatCompletion = await openai.chat.completions.create({
      model: "gpt-4-1106-vision-preview",
      messages: [
        {
          role: "user",
          content: [
            {
              type: "text",
              text: `Create an image based on this prompt: ${prompt}`,
            },
          ],
        },
      ],
      tools: [
        {
          type: "function",
          function: {
            name: "generate_image",
            description: "Generate an image using DALL·E 3",
            parameters: {
              type: "object",
              properties: {
                prompt: { type: "string", description: "Image description" },
              },
              required: ["prompt"],
            },
          },
        },
      ],
      tool_choice: {
        type: "function",
        function: { name: "generate_image" },
      },
    });

    const toolCall = chatCompletion.choices[0].message.tool_calls?.[0];
    if (!toolCall || !toolCall.function.arguments) {
      throw new Error("No tool function call was returned");
    }

    const toolArgs = JSON.parse(toolCall.function.arguments);
    const imagePrompt = toolArgs.prompt;

    const imageResponse = await openai.images.generate({
      model: "dall-e-3",
      prompt: imagePrompt,
      n: 1,
      size: "1024x1024",
      response_format: "url",
    });

    const imageUrl = imageResponse.data[0].url;

    return {
      statusCode: 200,
      body: JSON.stringify({ imageUrl }),
    };
  } catch (err) {
    console.error("❌ Server Error:", err);
    return {
      statusCode: 500,
      body: JSON.stringify({
        error: err.message || "Unexpected error",
      }),
    };
  }
};
