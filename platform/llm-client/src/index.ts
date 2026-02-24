import Anthropic from "@anthropic-ai/sdk";
import type { MessageParam } from "@anthropic-ai/sdk/resources/messages";

export type { MessageParam };

export interface LLMClient {
  chat(messages: MessageParam[], model?: string): Promise<string>;
}

export interface LLMClientOptions {
  apiKey: string;
  baseURL?: string;
  defaultModel?: string;
  timeout?: number;
}

export class LLMError extends Error {
  constructor(
    message: string,
    public readonly code: "rate_limit" | "timeout" | "api_error" | "unknown",
    public readonly cause?: unknown
  ) {
    super(message);
    this.name = "LLMError";
  }
}

export function createLLMClient(options: LLMClientOptions): LLMClient {
  const client = new Anthropic({
    apiKey: options.apiKey,
    baseURL: options.baseURL ?? "https://openrouter.ai/api",
    timeout: options.timeout ?? 30_000,
  });

  const defaultModel = options.defaultModel ?? "anthropic/claude-sonnet-4-5";

  return {
    async chat(messages: MessageParam[], model?: string): Promise<string> {
      try {
        const response = await client.messages.create({
          model: model ?? defaultModel,
          max_tokens: 1024,
          messages,
        });

        const content = response.content[0];
        if (content.type !== "text") {
          throw new LLMError("Unexpected response type", "api_error");
        }

        return content.text;
      } catch (err) {
        if (err instanceof LLMError) throw err;

        if (err instanceof Anthropic.RateLimitError) {
          throw new LLMError("Rate limit exceeded", "rate_limit", err);
        }

        if (err instanceof Anthropic.APIConnectionTimeoutError) {
          throw new LLMError("Request timed out", "timeout", err);
        }

        if (err instanceof Anthropic.APIError) {
          throw new LLMError(`API error: ${err.message}`, "api_error", err);
        }

        throw new LLMError("Unknown error", "unknown", err);
      }
    },
  };
}
