import OpenAI from "openai";
import type { LLMProvider, StreamArgs, StreamResponse } from "../provider.interface.js";

/**
 * Proveedor de LLM usando OpenRouter
 * Compatible con cualquier modelo de OpenRouter
 */
export class OpenRouterProvider implements LLMProvider {
  name = "OpenRouter";
  private client: OpenAI | null = null;
  private apiKey: string;
  private defaultModel: string;

  constructor(apiKey?: string, defaultModel?: string) {
    this.apiKey = apiKey || process.env.OPENROUTER_API_KEY || "";
    this.defaultModel = defaultModel || process.env.OPENROUTER_MODEL || "nvidia/nemotron-3-nano-30b-a3b:free";
  }

  async initialize(): Promise<void> {
    if (!this.apiKey) {
      throw new Error("OPENROUTER_API_KEY no está configurada");
    }

    this.client = new OpenAI({
      baseURL: "https://openrouter.ai/api/v1",
      apiKey: this.apiKey,
    });

    console.log(`[+] ${this.name} inicializado`);
  }

  async dispose(): Promise<void> {
    if (this.client) {
      // OpenAI client doesn't have explicit close, just clear reference
      this.client = null;
      console.log(`[+] ${this.name} cerrado`);
    }
  }

  async streamStructuredPlan(args: StreamArgs): Promise<StreamResponse> {
    if (!this.client) {
      await this.initialize();
    }

    const model = args.model ?? this.defaultModel;

    try {
      console.log(`\n [${this.name}] Enviando petición (modelo: ${model})...`);

      const stream = await this.client!.chat.completions.create({
        model,
        messages: [
          { role: "system", content: args.systemPrompt },
          { role: "user", content: args.userPrompt },
        ],
        temperature: args.temperature ?? 0,
        stream: true,
        stream_options: { include_usage: true },
      });

      let rawText = "";
      let reasoningTokens: number | undefined;

      for await (const chunk of stream) {
        const content = chunk.choices?.[0]?.delta?.content;
        if (content) {
          rawText += content;
          if (args.onChunk) {
            args.onChunk(content);
          } else {
            process.stdout.write(content);
          }
        }

        const usage = chunk.usage as any;
        if (usage?.reasoningTokens !== undefined) {
          reasoningTokens = usage.reasoningTokens;
        }
      }

      process.stdout.write("\n");
      return { rawText, reasoningTokens };

    } catch (error: unknown) {
      this.handleError(error, model);
      throw error;
    }
  }

  private handleError(error: unknown, model: string): void {
    console.error("\n");
    console.error("═══════════════════════════════════════════");
    console.error(` ERROR EN ${this.name.toUpperCase()}`);
    console.error("═══════════════════════════════════════════\n");

    console.error(" Modelo:", model);

    if (error && typeof error === "object" && "constructor" in error) {
      console.error(" Tipo de error:", error.constructor.name);
    }

    if (error instanceof Error) {
      console.error("\n Mensaje:");
      console.error(error.message);

      console.error("\n Stack trace:");
      console.error(error.stack);
    }

    if (error && typeof error === "object") {
      console.error("\n Detalles completos del error:");
      try {
        const errorDetails = JSON.stringify(error, Object.getOwnPropertyNames(error), 2);
        console.error(errorDetails);
      } catch (e) {
        console.error("(No se pudo serializar el error)");
      }
    }

    console.error("\n  Configuración:");
    console.error(`- Provider: ${this.name}`);
    console.error("- API Key:", this.apiKey ? `OK Presente (${this.apiKey.length} chars)` : "NO CONFIGURADA");
    console.error("- Modelo:", model);
    console.error("- Base URL: https://openrouter.ai/api/v1");

    console.error("\n═══════════════════════════════════════════\n");
  }
}
