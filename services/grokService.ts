import axios from 'axios';

const GROK_API_BASE_URL = 'https://api.grok.x.ai/v1beta';

interface GrokApiGenerationContent {
  parts: { text: string }[];
  role?: string; // Optional role, as it might not always be present
}
interface GrokApiCandidate {
  content: GrokApiGenerationContent;
  finishReason?: string;
  index?: number;
  tokenCount?: number;
  // Add other candidate properties if known/needed
}

interface GrokApiResponse {
  candidates: GrokApiCandidate[];
  usage?: { // Optional usage, as it might not always be present
    promptTokenCount?: number;
    candidatesTokenCount?: number;
    totalTokenCount?: number;
  };
  // Add other top-level response properties if known/needed
}

export const generateResponse = async (
  prompt: string,
  modelName: string,
  systemInstruction?: string,
  shouldApplyThinkingBudgetZero: boolean = false,
  imagePart?: { inlineData: { mimeType: string; data: string } }
) => {
  try {
    const headers = {
      'Authorization': `Bearer ${process.env.API_KEY}`,
      'Content-Type': 'application/json',
    };

    const messages = [];
    
    if (systemInstruction) {
      messages.push({
        role: 'system',
        content: systemInstruction
      });
    }

    messages.push({
      role: 'user',
      content: prompt
    });

    // Let TypeScript infer the response type
    const response = await axios.post<GrokApiResponse>(
      `${GROK_API_BASE_URL}/models/${modelName}/generateContent`, // Changed : to /
      {
        contents: messages, // Changed from 'messages' to 'contents' based on typical Google API style (which Grok might emulate for this endpoint)
        generationConfig: { // Added generationConfig based on typical Google API style
            temperature: shouldApplyThinkingBudgetZero ? 0 : 0.7,
            maxOutputTokens: 2048,
        }
      },
      { headers }
    );

    // Check if candidates exist and have the expected structure
    if (response.data && response.data.candidates && response.data.candidates.length > 0 &&
        response.data.candidates[0].content && response.data.candidates[0].content.parts &&
        response.data.candidates[0].content.parts.length > 0 && response.data.candidates[0].content.parts[0].text) {
      return {
        text: response.data.candidates[0].content.parts[0].text,
        usage: response.data.usage, // usage is optional, handle if it's not present
      };
    } else {
      // Log the unexpected structure for debugging
      console.error('Unexpected Grok API response structure:', response.data);
      throw new Error('Unexpected Grok API response structure');
    }
  } catch (error) {
    console.error('Error calling Grok API:', error);
    throw error;
  }
}; 