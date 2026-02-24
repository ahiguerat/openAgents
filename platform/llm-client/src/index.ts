import Anthropic from "@anthropic-ai/sdk";

// ─── Tipos propios del módulo ────────────────────────────────────────────────
// El resto del sistema solo importa estos tipos, nunca el SDK directamente.

export interface ChatMessage {
  role: "user" | "assistant";
  content: string | ContentBlock[];
}

export interface ContentBlock {
  type: "text" | "tool_use" | "tool_result";
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  [key: string]: any;
}

export interface ToolSpec {
  name: string;
  description: string;
  input_schema: Record<string, unknown>;
}

export interface ToolCall {
  id: string;
  name: string;
  input: Record<string, unknown>;
}

export interface LLMResponse {
  stopReason: "tool_use" | "end_turn";
  text: string | null;
  toolCalls: ToolCall[];
}

export interface LLMClient {
  chat(params: {
    system: string;
    messages: ChatMessage[];
    tools: ToolSpec[];
  }): Promise<LLMResponse>;
}

export interface LLMClientOptions {
  apiKey: string;
  baseURL?: string;
  defaultModel?: string;
  timeout?: number;
}

// ─── Errores ─────────────────────────────────────────────────────────────────

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

// ─── Factory ──────────────────────────────────────────────────────────────────

export function createLLMClient(options: LLMClientOptions): LLMClient {
  const client = new Anthropic({
    apiKey: options.apiKey,
    baseURL: options.baseURL ?? "https://openrouter.ai/api",
    timeout: options.timeout ?? 30_000,
  });

  const defaultModel = options.defaultModel ?? "anthropic/claude-sonnet-4-5";

  return {
    async chat({ system, messages, tools }): Promise<LLMResponse> {
      try {
        const response = await client.messages.create({
          model: defaultModel,
          max_tokens: 4096,
          system,
          messages: messages as Anthropic.MessageParam[],
          tools: tools.map((t) => ({
            name: t.name,
            description: t.description,
            input_schema: t.input_schema as Anthropic.Tool["input_schema"],
          })),
        });

        // Extraer texto y tool calls de la respuesta
        let text: string | null = null;
        const toolCalls: ToolCall[] = [];

        for (const block of response.content) {
          if (block.type === "text") {
            text = block.text;
          } else if (block.type === "tool_use") {
            toolCalls.push({
              id: block.id,
              name: block.name,
              input: block.input as Record<string, unknown>,
            });
          }
        }

        const stopReason = response.stop_reason === "tool_use"
          ? "tool_use"
          : "end_turn";

        return { stopReason, text, toolCalls };
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
