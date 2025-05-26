import { ApiProvider, ApiConfig } from '../types';
import * as geminiService from './geminiService';
import * as openAICompatibleService from './openAICompatibleService';

let currentConfig: ApiConfig | null = null;

export const initializeAI = (config: ApiConfig) => {
  currentConfig = config;
  
  // Set environment variables based on provider
  if (config.provider === ApiProvider.Gemini) {
    process.env.API_KEY = config.apiKey;
  } else if (config.provider === ApiProvider.OpenAICompatible) {
    process.env.OPENAI_API_KEY = config.apiKey;
    process.env.OPENAI_API_BASE_URL = config.baseUrl || 'https://api.openai.com';
  }
};

export const generateResponse = async (
  prompt: string,
  modelName: string,
  systemInstruction?: string,
  shouldApplyThinkingBudgetZero: boolean = false,
  imagePart?: { inlineData: { mimeType: string; data: string } }
) => {
  if (!currentConfig) {
    throw new Error("AI service not initialized. Call initializeAI first.");
  }

  if (currentConfig.provider === ApiProvider.Gemini) {
    return geminiService.generateResponse(
      prompt,
      modelName,
      systemInstruction,
      shouldApplyThinkingBudgetZero,
      imagePart
    );
  } else {
    return openAICompatibleService.generateResponse(
      prompt,
      modelName,
      systemInstruction,
      shouldApplyThinkingBudgetZero,
      imagePart
    );
  }
}; 