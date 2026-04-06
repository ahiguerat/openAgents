/**
 * Interfaz base para proveedores de LLM
 * Cualquier proveedor debe implementar esta interfaz
 */
export interface LLMProvider {
  /**
   * Nombre del proveedor (para logging)
   */
  name: string;

  /**
   * Inicializar el cliente (si es necesario)
   */
  initialize(): Promise<void>;

  /**
   * Realizar streaming de una respuesta estructurada
   */
  streamStructuredPlan(args: StreamArgs): Promise<StreamResponse>;

  /**
   * Liberar recursos y cerrar conexiones
   */
  dispose?(): Promise<void>;
}

/**
 * Argumentos para streamStructuredPlan
 */
export interface StreamArgs {
  systemPrompt: string;
  userPrompt: string;
  model?: string;
  temperature?: number;
  onChunk?: (content: string) => void;
}

/**
 * Respuesta de streamStructuredPlan
 */
export interface StreamResponse {
  rawText: string;
  reasoningTokens?: number;
}

/**
 * Configuración del proveedor
 */
export interface ProviderConfig {
  provider: "openrouter" | "copilot";
  apiKey?: string;
  baseURL?: string;
  defaultModel?: string;
  [key: string]: any; // Configuración adicional específica del proveedor
}
