# Dual AI Chat

A chat application that enables conversation between two AI models - Cognito (logical) and Muse (creative).

## Environment Setup

Create a `.env.local` file in the root directory with the following variables:

```env
# Gemini API Key
API_KEY=your_gemini_api_key_here

# Grok API Key
GROK_API_KEY=your_grok_api_key_here
```

## Available Models

The application supports the following models:

### Gemini Models
- Gemini 2.5 Flash (05-20)
- Gemini 2.5 Pro (05-06)

### Grok Models
- Grok 3 Beta
- Grok 3 Fast Beta
- Grok 3 Mini Beta
- Grok 3 Mini Fast Beta

## Development

```bash
npm install
npm run dev
```
