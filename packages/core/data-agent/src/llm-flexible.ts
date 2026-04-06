import type { LLMProvider, ProviderConfig } from "./llm-provider.js";
import { OpenRouterProvider } from "./providers/openrouter.js";
import { CopilotProvider } from "./providers/copilot.js";

/**
 * Factory para crear instancias de proveedores LLM
 */
export class LLMFactory {
  private static instance: LLMProvider | null = null;

  /**
   * Obtener o crear una instancia del proveedor configurado
   */
  static async getProvider(): Promise<LLMProvider> {
    if (this.instance) {
      return this.instance;
    }

    const config = this.getConfigFromEnv();
    this.instance = this.createProvider(config);
    await this.instance.initialize();

    return this.instance;
  }

  /**
   * Crear un proveedor específico sin usar singleton
   */
  static createProvider(config: ProviderConfig): LLMProvider {

    switch (config.provider) {
      case "openrouter":
        return new OpenRouterProvider(config.apiKey, config.defaultModel);

      case "copilot":
        return new CopilotProvider(config.defaultModel);

      default:
        throw new Error(
          `Proveedor LLM no soportado: ${config.provider}\n` +
          `Proveedores disponibles: openrouter, copilot`
        );
    }
  }

  /**
   * Leer configuración desde variables de entorno
   */
  private static getConfigFromEnv(): ProviderConfig {
    const provider = (process.env.LLM_PROVIDER || "openrouter") as ProviderConfig["provider"];

    const config: ProviderConfig = {
      provider,
    };

    // Configuración específica por proveedor
    switch (provider) {
      case "openrouter":
        config.apiKey = process.env.OPENROUTER_API_KEY;
        config.defaultModel = process.env.OPENROUTER_MODEL;
        config.baseURL = "https://openrouter.ai/api/v1";
        break;

      case "copilot":
        config.defaultModel = process.env.COPILOT_MODEL;
        break;
    }

    return config;
  }

  /**
   * Resetear el singleton (útil para tests)
   */
  static reset(): void {
    this.instance = null;
  }

  /**
   * Liberar recursos del proveedor actual
   */
  static async dispose(): Promise<void> {
    if (this.instance?.dispose) {
      await this.instance.dispose();
    }
    this.instance = null;
  }
}

/**
 * Helper para obtener el proveedor LLM actual
 * Uso simplificado en el código
 */
export async function getLLMProvider(): Promise<LLMProvider> {
  return LLMFactory.getProvider();
}

/**
 * Helper para ejecutar streaming estructurado
 * Mantiene la misma interfaz que antes para retrocompatibilidad
 */
export async function streamStructuredPlan(args: {
  systemPrompt: string;
  userPrompt: string;
  model?: string;
}): Promise<{ rawText: string; reasoningTokens?: number }> {
  const provider = await getLLMProvider();
  return provider.streamStructuredPlan(args);
}
