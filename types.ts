export enum MessageSender {
  User = 'User',
  Cognito = 'Cognito', // Logical AI
  Muse = 'Muse',     // Creative AI
  System = 'System',
}

export enum MessagePurpose {
  UserInput = 'user-input',
  SystemNotification = 'system-notification',
  CognitoToMuse = 'cognito-to-muse',      // Cognito's message to Muse for discussion
  MuseToCognito = 'muse-to-cognito',      // Muse's response to Cognito
  FinalResponse = 'final-response',       // Final response from Cognito to User
}

export interface ChatMessage {
  id: string;
  text: string;
  sender: MessageSender;
  purpose: MessagePurpose;
  timestamp: Date;
  durationMs?: number; // Time taken to generate this message (for AI messages)
  image?: { // Optional image data for user messages
    dataUrl: string; // base64 data URL for displaying the image
    name: string;
    type: string;
  };
}