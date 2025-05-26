import { ChatMessage, MessagePurpose, MessageSender } from '../types';
import {
  GROK_3,
  GROK_3_FAST,
  GROK_3_MINI,
  GROK_3_MINI_FAST,
} from '../constants';

interface GrokApiResponse {
  choices: {
    message: {
      content: string;
    };
  }[];
  usage: {
    total_tokens: number;
  };
}

export class GrokService {
  private apiKey: string;
  private apiEndpoint: string = 'https://api.x.ai/v1/chat/completions';

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  private isGrokModel(model: string): boolean {
    return [
      GROK_3,
      GROK_3_FAST,
      GROK_3_MINI,
      GROK_3_MINI_FAST
    ].includes(model);
  }

  async generateResponse(
    messages: ChatMessage[],
    model: string,
    maxTokens: number = 1000,
  ): Promise<{ text: string; durationMs: number; error?: string }> {
    if (!this.apiKey) {
      return {
        text: 'Grok API key is not configured',
        durationMs: 0,
        error: 'API key not valid'
      };
    }

    if (!this.isGrokModel(model)) {
      return {
        text: `Invalid Grok model: ${model}`,
        durationMs: 0,
        error: `Invalid Grok model: ${model}`
      };
    }

    const startTime = Date.now();

    const formattedMessages = messages.map(msg => ({
      role: this.mapSenderToRole(msg.sender),
      content: msg.text,
    }));

    try {
      console.log('Making Grok API request:', {
        endpoint: this.apiEndpoint,
        model,
        messageCount: messages.length,
        hasApiKey: !!this.apiKey
      });

      const response = await fetch(this.apiEndpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({
          model: model,
          messages: formattedMessages,
          max_tokens: maxTokens,
          temperature: 0.7,
          top_p: 1,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('Grok API error response:', {
          status: response.status,
          statusText: response.statusText,
          error: errorText
        });
        return {
          text: errorText,
          durationMs: Date.now() - startTime,
          error: `Grok API error (${response.status}): ${errorText}`
        };
      }

      const data: GrokApiResponse = await response.json();
      const generatedText = data.choices[0]?.message?.content;

      if (!generatedText) {
        return {
          text: 'No response generated from Grok API',
          durationMs: Date.now() - startTime,
          error: 'No response generated from Grok API'
        };
      }

      return {
        text: generatedText,
        durationMs: Date.now() - startTime,
      };
    } catch (error) {
      console.error('Error calling Grok API:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      return {
        text: errorMessage,
        durationMs: Date.now() - startTime,
        error: `Network error: ${errorMessage}`
      };
    }
  }

  private mapSenderToRole(sender: MessageSender): string {
    switch (sender) {
      case MessageSender.User:
        return 'user';
      case MessageSender.System:
        return 'system';
      case MessageSender.Cognito:
      case MessageSender.Muse:
        return 'assistant';
      default:
        return 'user';
    }
  }
} 