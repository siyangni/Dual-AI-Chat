import { GoogleGenAI, GenerateContentResponse, Part } from "@google/genai";
import { THINKING_BUDGET_DISABLED, MODELS } from '../constants';
import { ApiProvider } from "../types";

// Store API keys in a more structured way, potentially loaded from .env
// For now, still relying on process.env but more specific names
const API_KEYS = {
  [ApiProvider.Gemini]: process.env.GEMINI_API_KEY,
  [ApiProvider.Grok]: process.env.GROK_API_KEY,
  [ApiProvider.OpenAICompatible]: process.env.OPENAI_API_KEY,
};

let geminiAI: GoogleGenAI | null = null;

const initializeGeminiAI = (): GoogleGenAI => {
  if (!API_KEYS[ApiProvider.Gemini]) {
    console.error("GEMINI_API_KEY is not defined in environment variables.");
    throw new Error("GEMINI_API_KEY 未配置。无法初始化 Gemini API。");
  }
  if (!geminiAI) {
    geminiAI = new GoogleGenAI({ apiKey: API_KEYS[ApiProvider.Gemini] });
  }
  return geminiAI;
};

interface ApiResponse {
  text: string;
  durationMs: number;
  error?: string;
}

export const generateResponse = async (
  prompt: string,
  modelApiName: string,
  systemInstruction?: string,
  shouldApplyThinkingBudgetZero: boolean = false,
  imagePart?: { inlineData: { mimeType: string; data: string } }
): Promise<ApiResponse> => {
  const startTime = performance.now();
  const modelDetails = MODELS.find(m => m.apiName === modelApiName);

  if (!modelDetails) {
    return {
      text: `模型 ${modelApiName} 未找到。`,
      durationMs: performance.now() - startTime,
      error: `Model ${modelApiName} not found`
    };
  }

  try {
    if (modelDetails.provider === ApiProvider.Gemini) {
      if (!API_KEYS[ApiProvider.Gemini]) {
        throw new Error("GEMINI_API_KEY 未配置。");
      }
      const genAI = initializeGeminiAI();
      const configForApi: { systemInstruction?: { role: string, parts: Part[] }, thinkingConfig?: { thinkingBudget: number } } = {};

      if (systemInstruction) {
        // Gemini API's systemInstruction is an object, not a string
        configForApi.systemInstruction = { role: "system", parts: [{text: systemInstruction}] };
      }

      if (shouldApplyThinkingBudgetZero && modelDetails.supportsThinkingBudget) { // only apply if model supports it
        configForApi.thinkingConfig = THINKING_BUDGET_DISABLED.thinkingConfig;
      }

      const textPart: Part = { text: prompt };
      const requestParts: Part[] = [];

      if (imagePart) {
        requestParts.push(imagePart);
      }
      requestParts.push(textPart);

      const model = genAI.getGenerativeModel({ model: modelDetails.apiName, ...configForApi });
      const result = await model.generateContent({parts: requestParts});
      
      // Correctly accessing the text from Gemini's response
      const responseText = result.response.candidates && result.response.candidates[0].content.parts.map((part: Part) => part.text).join('') || "";

      const durationMs = performance.now() - startTime;
      return { text: responseText, durationMs };

    } else if (modelDetails.provider === ApiProvider.Grok) {
      if (!API_KEYS[ApiProvider.Grok]) {
        throw new Error("GROK_API_KEY 未配置。");
      }
      // Placeholder for Grok API call
      console.warn("Grok API call is not implemented yet. Returning a placeholder error.");
      // Simulate an async operation for timing
      await new Promise(resolve => setTimeout(resolve, 50)); 
      return {
        text: "Grok API 功能暂未实现。",
        durationMs: performance.now() - startTime,
        error: "Grok API not implemented",
      };
    } else if (modelDetails.provider === ApiProvider.OpenAICompatible) {
      if (!API_KEYS[ApiProvider.OpenAICompatible]) {
        throw new Error("OPENAI_API_KEY 未配置。");
      }
      // Placeholder for OpenAI Compatible API call
      console.warn("OpenAI Compatible API call is not implemented yet. Returning a placeholder error.");
      // Simulate an async operation for timing
      await new Promise(resolve => setTimeout(resolve, 50));
      return {
        text: "OpenAI API 功能暂未实现。",
        durationMs: performance.now() - startTime,
        error: "OpenAI API not implemented",
      };
    } else {
      return {
        text: `不支持的 API 提供商: ${modelDetails.provider}`,
        durationMs: performance.now() - startTime,
        error: `Unsupported API provider: ${modelDetails.provider}`
      };
    }
  } catch (error) {
    console.error(`调用 ${modelDetails.provider} API 时出错:`, error);
    const durationMs = performance.now() - startTime;
    let errorMessage = "发生未知错误。";
    let errorCode = `Unknown ${modelDetails.provider} AI error`;

    if (error instanceof Error) {
        errorMessage = error.message;
        errorCode = error.message; // Use the actual error message as code for now
      if (error.message.includes('API key') || error.message.includes('API_KEY')) {
        errorMessage = `API密钥无效或未配置 (${modelDetails.provider})。请检查您的API密钥配置 (${modelDetails.provider === ApiProvider.Gemini ? 'GEMINI_API_KEY' : modelDetails.provider === ApiProvider.Grok ? 'GROK_API_KEY' : 'OPENAI_API_KEY'})。`;
        errorCode = `API key not valid or missing for ${modelDetails.provider}`;
      }
    }
    return { text: `与 ${modelDetails.provider} AI 通信时出错: ${errorMessage}`, durationMs, error: errorCode };
  }
}; 