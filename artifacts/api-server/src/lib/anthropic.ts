import Anthropic from "@anthropic-ai/sdk";

const baseURL = process.env["AI_INTEGRATIONS_ANTHROPIC_BASE_URL"];
const apiKey = process.env["AI_INTEGRATIONS_ANTHROPIC_API_KEY"];

if (!baseURL || !apiKey) {
  // Don't throw at startup — chat endpoints will respond with a clear error
  // if these are missing rather than crash the server.
  // Logged via the request logger when /api/chat is called.
}

export const anthropic = new Anthropic({
  baseURL: baseURL,
  apiKey: apiKey ?? "missing",
});

export const anthropicConfigured: boolean = Boolean(baseURL && apiKey);

export const DEFAULT_CHAT_MODEL = "claude-sonnet-4-6";
