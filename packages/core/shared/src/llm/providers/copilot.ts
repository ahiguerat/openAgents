import type { LLMProvider, StreamArgs, StreamResponse } from "../provider.interface.js";

/**
 * Proveedor de LLM usando GitHub Copilot SDK
 * Requiere Copilot CLI instalado y autenticado
 */
export class CopilotProvider implements LLMProvider {
  name = "GitHub Copilot SDK";
  private client: any = null;
  private defaultModel: string;
  private approveAll: any = null;

  constructor(defaultModel?: string) {
    this.defaultModel = defaultModel || process.env.COPILOT_MODEL || "claude-sonnet-4.5";
  }

  async initialize(): Promise<void> {
    try {
      const { CopilotClient, approveAll } = await import("@github/copilot-sdk");
      this.client = new CopilotClient();
      await this.client.start();
      this.approveAll = approveAll;
      console.log(`[+] ${this.name} inicializado`);
    } catch (error) {
      if (error instanceof Error && error.message.includes("Cannot find module")) {
        throw new Error("GitHub Copilot SDK no está instalado. Ejecuta: npm install @github/copilot-sdk");
      }
      throw new Error(`Error inicializando ${this.name}: ${error}`);
    }
  }

  async dispose(): Promise<void> {
    if (this.client) {
      try {
        await this.client.stop();
        this.client = null;
        console.log(`[+] ${this.name} cerrado`);
      } catch (error) {
        console.error(`Error cerrando ${this.name}:`, error);
      }
    }
  }

  async streamStructuredPlan(args: StreamArgs): Promise<StreamResponse> {
    if (!this.client) {
      await this.initialize();
    }

    const model = args.model ?? this.defaultModel;

    try {
      console.log(`\n [${this.name}] Enviando petición (modelo: ${model})...`);

      const session = await this.client.createSession({
        model,
        streaming: true,
        temperature: args.temperature ?? 0,
        onPermissionRequest: this.approveAll,
      });

      const fullPrompt = `${args.systemPrompt}\n\n${args.userPrompt}`;
      
      let rawText = "";
      let reasoningTokens: number | undefined;

      // Setup event handlers
      const done = new Promise<void>((resolve, reject) => {
        session.on("assistant.message", (event: any) => {
          const content = event.data.content || "";
          rawText += content;
          if (args.onChunk) {
            args.onChunk(content);
          } else {
            process.stdout.write(content);
          }
        });

        session.on("session.idle", () => {
          resolve();
        });

        session.on("error", (error: any) => {
          reject(error);
        });
      });

      // Send prompt and wait for completion
      await session.send({ prompt: fullPrompt });
      await done;

      process.stdout.write("\n");
      await session.disconnect();

      return { rawText, reasoningTokens };
    } catch (error: unknown) {
      this.handleError(error, model);
      throw error;
    }
  }

  private handleError(error: unknown, model: string): void {
    console.error("\n═══════════════════════════════════════════");
    console.error(` ERROR EN ${this.name.toUpperCase()}`);
    console.error("═══════════════════════════════════════════\n");
    console.error(" Modelo:", model);

    if (error instanceof Error) {
      console.error("\n Mensaje:", error.message);
      console.error("\n Stack trace:", error.stack);
    }

    console.error(`\n  Provider: ${this.name}`);
    console.error(" Asegúrate de:");
    console.error("   • Tener GitHub Copilot CLI instalado");
    console.error("   • Estar autenticado (gh auth login)");
    console.error("   • Tener una suscripción activa de Copilot");
    console.error("\n═══════════════════════════════════════════\n");
  }
}
