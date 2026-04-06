import { StateGraph, START, END, Annotation } from "@langchain/langgraph";
import { VisualizationPlan, VisualizationRequest, ChartConfig, DEFAULT_CHART_CONFIG } from "./types.js";
import { planVisualization } from "./planner.js";
import { generateChartTool, saveImageTool } from "./tools.js";

/**
 * Estado del visualization graph
 */
const VizState = Annotation.Root({
  /** Request original del usuario */
  request: Annotation<VisualizationRequest>,
  
  /** Plan generado por el planner */
  plan: Annotation<VisualizationPlan | null>,
  
  /** URL de la gráfica generada */
  imageUrl: Annotation<string | null>,
  
  /** CSV content si se genera tabla */
  csvContent: Annotation<string | null>,
  
  /** Indica si es CSV en lugar de imagen */
  isCSV: Annotation<boolean>,
  
  /** HTML content si se genera HTML interactivo */
  htmlContent: Annotation<string | null>,
  
  /** Indica si es HTML en lugar de imagen */
  isHTML: Annotation<boolean>,
  
  /** Path del archivo guardado */
  filePath: Annotation<string | null>,
  
  /** Tamaño del archivo en bytes */
  fileSize: Annotation<number | null>,
  
  /** Configuración del chart */
  config: Annotation<ChartConfig>,
  
  /** Directorio de salida */
  outputDir: Annotation<string>,
  
  /** Error si ocurrió alguno */
  error: Annotation<string | null>,
});

/**
 * Node 1: Planner
 * Analiza el prompt y los datos para decidir qué visualización crear
 */
const plannerNode = async (state: typeof VizState.State) => {
  try {
    console.error("\n[VIZ_AGENT][GRAPH][PLANNER] Analyzing visualization request");
    console.error(`[VIZ_AGENT][GRAPH][PLANNER] Prompt: ${state.request.prompt}`);
    console.error(`[VIZ_AGENT][GRAPH][PLANNER] Data points: ${state.request.data.length}`);
    
    const plan = await planVisualization(state.request);
    
    console.error(`[VIZ_AGENT][GRAPH][PLANNER] Plan created: ${plan.chartType}`);
    console.error(`[VIZ_AGENT][GRAPH][PLANNER] Title: ${plan.title}`);
    
    return {
      plan,
      error: null,
    };
  } catch (error) {
    console.error(`[VIZ_AGENT][GRAPH][PLANNER] Error: ${error instanceof Error ? error.message : error}`);
    return {
      plan: null,
      error: error instanceof Error ? error.message : "Planning failed",
    };
  }
};

/**
 * Node 2: Chart Generator
 * Usa la tool generateChartTool para crear la gráfica
 */
const generatorNode = async (state: typeof VizState.State) => {
  if (!state.plan) {
    console.error("[VIZ_AGENT][GRAPH][GENERATOR] No plan available, skipping");
    return {
      error: "No plan available",
    };
  }

  try {
    console.error("\n[VIZ_AGENT][GRAPH][GENERATOR] Generating chart");
    
    // Obtener chartProvider desde request o usar por defecto
    const chartProvider = state.request.chartProvider || 'quickchart';
    console.error(`[VIZ_AGENT][GRAPH][GENERATOR] Using chart provider: ${chartProvider}`);
    
    const result = await generateChartTool(
      state.plan,
      state.request.data,
      state.config,
      chartProvider
    );
    
    console.error(`[VIZ_AGENT][GRAPH][GENERATOR] Chart generated successfully`);
    
    return {
      imageUrl: result.url,
      csvContent: result.csvContent || null,
      isCSV: result.isCSV || false,
      htmlContent: result.htmlContent || null,
      isHTML: result.isHTML || false,
      error: null,
    };
  } catch (error) {
    console.error(`[VIZ_AGENT][GRAPH][GENERATOR] Error: ${error instanceof Error ? error.message : error}`);
    return {
      error: error instanceof Error ? error.message : "Chart generation failed",
    };
  }
};

/**
 * Node 3: Image/CSV/HTML Saver
 * Usa la tool saveImageTool para guardar la imagen, CSV o HTML en disco
 */
const saverNode = async (state: typeof VizState.State) => {
  // Si es CSV, necesitamos csvContent
  if (state.isCSV && !state.csvContent) {
    console.error("[VIZ_AGENT][GRAPH][SAVER] No CSV content available, skipping");
    return {
      error: "No CSV content available",
    };
  }
  
  // Si es HTML, necesitamos htmlContent
  if (state.isHTML && !state.htmlContent) {
    console.error("[VIZ_AGENT][GRAPH][SAVER] No HTML content available, skipping");
    return {
      error: "No HTML content available",
    };
  }
  
  // Si es imagen, necesitamos imageUrl
  if (!state.isCSV && !state.isHTML && !state.imageUrl) {
    console.error("[VIZ_AGENT][GRAPH][SAVER] No image URL available, skipping");
    return {
      error: "No image URL available",
    };
  }

  try {
    if (state.isCSV) {
      console.error("\n[VIZ_AGENT][GRAPH][SAVER] Saving CSV to disk");
      console.error(`[VIZ_AGENT][GRAPH][SAVER] Output directory: ${state.outputDir}`);
      
      const result = await saveImageTool(
        '', // No URL for CSV
        state.outputDir,
        undefined, // Auto-generate filename
        state.csvContent!,
        undefined // No HTML
      );
      
      console.error(`[VIZ_AGENT][GRAPH][SAVER] CSV saved: ${result.filePath}`);
      console.error(`[VIZ_AGENT][GRAPH][SAVER] File size: ${result.size} bytes`);
      
      return {
        filePath: result.filePath,
        fileSize: result.size,
        error: null,
      };
    } else if (state.isHTML) {
      console.error("\n[VIZ_AGENT][GRAPH][SAVER] Saving HTML to disk");
      console.error(`[VIZ_AGENT][GRAPH][SAVER] Output directory: ${state.outputDir}`);
      
      const result = await saveImageTool(
        '', // No URL for HTML
        state.outputDir,
        undefined, // Auto-generate filename
        undefined, // No CSV
        state.htmlContent!
      );
      
      console.error(`[VIZ_AGENT][GRAPH][SAVER] HTML saved: ${result.filePath}`);
      console.error(`[VIZ_AGENT][GRAPH][SAVER] File size: ${result.size} bytes`);
      
      return {
        filePath: result.filePath,
        fileSize: result.size,
        error: null,
      };
    } else {
      console.error("\n[VIZ_AGENT][GRAPH][SAVER] Saving image to disk");
      console.error(`[VIZ_AGENT][GRAPH][SAVER] Output directory: ${state.outputDir}`);
      
      const result = await saveImageTool(
        state.imageUrl!,
        state.outputDir
      );
      
      console.error(`[VIZ_AGENT][GRAPH][SAVER] Image saved: ${result.filePath}`);
      console.error(`[VIZ_AGENT][GRAPH][SAVER] File size: ${result.size} bytes`);
      
      return {
        filePath: result.filePath,
        fileSize: result.size,
        error: null,
      };
    }
  } catch (error) {
    console.error(`[VIZ_AGENT][GRAPH][SAVER] Error: ${error instanceof Error ? error.message : error}`);
    return {
      error: error instanceof Error ? error.message : "Save failed",
    };
  }
};

/**
 * Construir el graph del viz-agent
 */
export function buildVisualizationGraph() {
  return new StateGraph(VizState)
    .addNode("planner", plannerNode)
    .addNode("generator", generatorNode)
    .addNode("saver", saverNode)
    .addEdge(START, "planner")
    .addEdge("planner", "generator")
    .addEdge("generator", "saver")
    .addEdge("saver", END)
    .compile();
}

/**
 * Función helper para ejecutar el graph completo
 */
export async function executeVisualization(
  request: VisualizationRequest,
  config: ChartConfig = DEFAULT_CHART_CONFIG,
  outputDir: string = './output'
) {
  console.error("[VIZ_AGENT][GRAPH] Starting visualization pipeline");
  
  const graph = buildVisualizationGraph();
  
  const result = await graph.invoke({
    request,
    plan: null,
    imageUrl: null,
    filePath: null,
    fileSize: null,
    config,
    outputDir,
    error: null,
  });
  
  console.error("[VIZ_AGENT][GRAPH] Pipeline completed");
  
  return result;
}
