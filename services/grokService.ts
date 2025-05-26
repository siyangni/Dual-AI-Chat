import axios from 'axios';

const GROK_API_BASE_URL = 'https://api.grok.x.ai/v1beta';

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

    const response = await axios.post(
      `${GROK_API_BASE_URL}/models/${modelName}/generateContent`,
      {
        messages,
        temperature: shouldApplyThinkingBudgetZero ? 0 : 0.7,
        maxOutputTokens: 2048,
      },
      { headers }
    );

    return {
      text: response.data.candidates[0].content.parts[0].text,
      usage: response.data.usage,
    };
  } catch (error) {
    console.error('Error calling Grok API:', error);
    throw error;
  }
}; 