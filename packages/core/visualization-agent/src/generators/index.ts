import { VisualizationPlan, ChartConfig } from '../types.js';

/**
 * Resultado de la generación de una gráfica
 */
export interface ChartGenerationResult {
  /** URL de la imagen generada (para proveedores que usan URLs como QuickChart) */
  url?: string;
  
  /** Configuración del chart usada */
  chartConfig?: any;
  
  /** Contenido CSV si se genera tabla */
  csvContent?: string;
  
  /** Indica si es CSV en lugar de imagen */
  isCSV?: boolean;
  
  /** Contenido HTML si se genera HTML interactivo */
  htmlContent?: string;
  
  /** Indica si es HTML en lugar de imagen */
  isHTML?: boolean;
  
  /** Path del archivo si se guardó localmente */
  filePath?: string;
}

/**
 * Interfaz común para todos los proveedores de gráficas
 */
export interface IChartGenerator {
  /**
   * Nombre del proveedor (quickchart, chartjs, plotly, etc)
   */
  readonly name: string;
  
  /**
   * Genera una visualización según el plan y los datos
   * @param plan Plan de visualización con tipo de gráfica, campos, etc
   * @param data Array de datos a visualizar
   * @param config Configuración de tamaño, colores, etc
   * @returns Resultado de la generación (URL, CSV, HTML, etc)
   */
  generate(
    plan: VisualizationPlan,
    data: any[],
    config: ChartConfig
  ): Promise<ChartGenerationResult>;
}

/**
 * Factory para obtener el generador de gráficas apropiado
 */
export class ChartGeneratorFactory {
  private static generators: Map<string, IChartGenerator> = new Map();
  private static initialized = false;
  
  /**
   * Inicializa la factory con los generadores por defecto
   */
  private static async initialize(): Promise<void> {
    if (this.initialized) return;
    
    console.error('[CHART_FACTORY] Initializing factory...');
    
    // Importar y registrar QuickChart como proveedor por defecto
    try {
      const module = await import('./quickchart.js');
      const quickchartGenerator = new module.QuickChartGenerator();
      this.generators.set('quickchart', quickchartGenerator);
      console.error('[CHART_FACTORY] QuickChart registered as default provider');
    } catch (error) {
      console.error(`[CHART_FACTORY] Failed to load QuickChart: ${error instanceof Error ? error.message : error}`);
    }
    
    this.initialized = true;
  }
  
  /**
   * Registra un generador de gráficas
   */
  static register(name: string, generator: IChartGenerator): void {
    this.generators.set(name.toLowerCase(), generator);
    console.error(`[CHART_FACTORY] Registered generator: ${name}`);
  }
  
  /**
   * Obtiene el generador apropiado según el nombre del proveedor
   * @param provider Nombre del proveedor (quickchart, chartjs, etc). Default: 'quickchart'
   * @returns Instancia del generador o null si no existe
   */
  static async getGenerator(provider?: string): Promise<IChartGenerator | null> {
    await this.initialize();
    
    const providerName = (provider || 'quickchart').toLowerCase();
    const generator = this.generators.get(providerName);
    
    if (!generator) {
      console.error(`[CHART_FACTORY] Generator not found: ${providerName}`);
      console.error(`[CHART_FACTORY] Available generators: ${Array.from(this.generators.keys()).join(', ')}`);
      return null;
    }
    
    console.error(`[CHART_FACTORY] Using generator: ${providerName}`);
    return generator;
  }
  
  /**
   * Verifica si existe un generador registrado
   */
  static async hasGenerator(provider: string): Promise<boolean> {
    await this.initialize();
    return this.generators.has(provider.toLowerCase());
  }
  
  /**
   * Lista todos los generadores disponibles
   */
  static async listGenerators(): Promise<string[]> {
    await this.initialize();
    return Array.from(this.generators.keys());
  }
}
