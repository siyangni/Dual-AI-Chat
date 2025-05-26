import { THINKING_BUDGET_DISABLED } from '../constants';

interface OpenAICompatibleResponse {
  text: string;
  durationMs: number;
  error?: string;
}

export const generateResponse = async (
  prompt: string,
  modelName: string,
  systemInstruction?: string,
  shouldApplyThinkingBudgetZero: boolean = false,
  imagePart?: { inlineData: { mimeType: string; data: string } }
): Promise<OpenAICompatibleResponse> => {
  const startTime = performance.now();
  try {
    if (!process.env.OPENAI_API_KEY) {
      throw new Error("OPENAI_API_KEY is not configured");
    }

    if (!process.env.OPENAI_API_BASE_URL) {
      throw new Error("OPENAI_API_BASE_URL is not configured");
    }

    const messages = [];
    
    if (systemInstruction) {
      messages.push({
        role: "system",
        content: systemInstruction
      });
    }

    // Handle image if provided
    if (imagePart) {
      const imageContent = {
        type: "image_url",
        image_url: {
          url: `data:${imagePart.inlineData.mimeType};base64,${imagePart.inlineData.data}`
        }
      };
      messages.push({
        role: "user",
        content: [imageContent, { type: "text", text: prompt }]
      });
    } else {
      messages.push({
        role: "user",
        content: prompt
      });
    }

    const response = await fetch(`${process.env.OPENAI_API_BASE_URL}/v1/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`
      },
      body: JSON.stringify({
        model: modelName,
        messages: messages,
        temperature: shouldApplyThinkingBudgetZero ? 0 : 0.7,
      })
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error?.message || 'API request failed');
    }

    const data = await response.json();
    const generatedText = data.choices[0]?.message?.content || '';
    
    const durationMs = performance.now() - startTime;
    return { text: generatedText, durationMs };
  } catch (error) {
    console.error("Error calling OpenAI-compatible API:", error);
    const durationMs = performance.now() - startTime;
    if (error instanceof Error) {
      if (error.message.includes('API key')) {
        return { text: "API key is invalid. Please check your API key configuration.", durationMs, error: "API key not valid" };
      }
      return { text: `Error communicating with AI: ${error.message}`, durationMs, error: error.message };
    }
    return { text: "An unknown error occurred while communicating with AI.", durationMs, error: "Unknown AI error" };
  }
}; 