import { GoogleGenAI, GenerateContentResponse, Part } from "@google/genai";
import { THINKING_BUDGET_DISABLED } from '../constants';

let ai: GoogleGenAI | null = null;

const initializeGoogleAI = (): GoogleGenAI => {
  if (!process.env.API_KEY) {
    console.error("API_KEY is not defined in environment variables.");
    throw new Error("API_KEY 未配置。无法初始化 Gemini API。");
  }
  if (!ai) {
    ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  }
  return ai;
};

interface GeminiResponse {
  text: string;
  durationMs: number;
  error?: string;
}

export const generateResponse = async (
  prompt: string,
  modelName: string,
  systemInstruction?: string,
  shouldApplyThinkingBudgetZero: boolean = false,
  imagePart?: { inlineData: { mimeType: string; data: string } } // Optional image part
): Promise<GeminiResponse> => {
  const startTime = performance.now();
  try {
    const genAI = initializeGoogleAI();
    
    const configForApi: { systemInstruction?: string, thinkingConfig?: { thinkingBudget: number } } = {};

    if (systemInstruction) {
      configForApi.systemInstruction = systemInstruction;
    }

    if (shouldApplyThinkingBudgetZero) {
      configForApi.thinkingConfig = THINKING_BUDGET_DISABLED.thinkingConfig;
    }

    const textPart: Part = { text: prompt };
    let requestContents: string | { parts: Part[] };

    if (imagePart) {
      // Order: image first, then text, as per common examples.
      requestContents = { parts: [imagePart, textPart] };
    } else {
      requestContents = prompt; // If no image, content is just the prompt string
    }

    const response: GenerateContentResponse = await genAI.models.generateContent({
      model: modelName,
      contents: requestContents,
      config: configForApi,
    });
    
    const durationMs = performance.now() - startTime;
    return { text: response.text, durationMs };
  } catch (error) {
    console.error("Error calling Gemini API:", error);
    const durationMs = performance.now() - startTime;
    if (error instanceof Error) {
      if (error.message.includes('API key not valid')) {
         return { text: "Invalid API key. Please check your API key configuration.", durationMs, error: "API key not valid" };
      }
      return { text: `Error communicating with AI: ${error.message}`, durationMs, error: error.message };
    }
    return { text: "An unknown error occurred while communicating with AI.", durationMs, error: "Unknown AI error" };
  }
};