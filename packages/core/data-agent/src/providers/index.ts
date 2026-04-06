/**
 * Data Provider Interface and Factory
 * 
 * Permite desacoplar la fuente de datos del data-agent,
 * facilitando la adición de nuevas fuentes en el futuro.
 */

export interface DataProviderConfig {
  baseUrl?: string;
  headers?: Record<string, string>;
  timeout?: number;
}

export interface DataProviderResponse {
  success: boolean;
  data?: any;
  error?: string;
  details?: string;
  status?: number;
  headers?: Record<string, string>;
}

/**
 * Interface común para todos los data providers
 */
export interface IDataProvider {
  /**
   * Nombre del provider (ej: "cti", "postgres", "mongodb")
   */
  getName(): string;

  /**
   * URL base del provider
   */
  getBaseUrl(): string;

  /**
   * Valida que los parámetros sean correctos para este provider
   */
  validateParams(params: any): boolean;

  /**
   * Ejecuta una consulta al provider
   * @param url URL completa o path relativo
   * @param method Método HTTP (GET, POST, etc)
   * @param config Configuración adicional
   */
  fetchData(
    url: string,
    method?: string,
    config?: DataProviderConfig
  ): Promise<DataProviderResponse>;
}

/**
 * Factory para gestionar data providers
 */
export class DataProviderFactory {
  private static providers = new Map<string, IDataProvider>();
  private static initialized = false;

  /**
   * Inicializa el factory cargando providers disponibles
   */
  static async initialize(): Promise<void> {
    if (this.initialized) {
      return;
    }

    console.log("[DataProviderFactory] Inicializando providers...");

    try {
      // Cargar CTI provider dinámicamente
      const { CtiProvider } = await import("./cti-provider.js");
      const ctiProvider = new CtiProvider();
      this.registerProvider("cti", ctiProvider);
      
      console.log(`[DataProviderFactory] ✓ Provider registrado: ${ctiProvider.getName()}`);
      
      this.initialized = true;
      console.log("[DataProviderFactory] Inicialización completa");
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : "Error desconocido";
      console.error("[DataProviderFactory] Error al inicializar:", errorMsg);
      throw error;
    }
  }

  /**
   * Registra un nuevo provider
   */
  static registerProvider(name: string, provider: IDataProvider): void {
    this.providers.set(name.toLowerCase(), provider);
    console.log(`[DataProviderFactory] Provider '${name}' registrado`);
  }

  /**
   * Obtiene un provider por nombre
   * @param name Nombre del provider (por defecto "cti")
   */
  static async getProvider(name: string = "cti"): Promise<IDataProvider> {
    // Asegurar que esté inicializado
    if (!this.initialized) {
      await this.initialize();
    }

    const provider = this.providers.get(name.toLowerCase());
    
    if (!provider) {
      const available = Array.from(this.providers.keys()).join(", ");
      throw new Error(
        `Data provider '${name}' no encontrado. Disponibles: ${available}`
      );
    }

    return provider;
  }

  /**
   * Lista todos los providers disponibles
   */
  static listProviders(): string[] {
    return Array.from(this.providers.keys());
  }
}
