import { StateGraph, START, END, Annotation } from "@langchain/langgraph";
import { buildPlannerPrompt } from "./prompts.js";
import { streamStructuredPlan } from "@openagents/shared/llm";
import { DataAgentMCPClient } from "./clients/data-agent-mcp-client.js";
import { VizAgentMCPClient } from "./clients/viz-agent-mcp-client.js";
import { safeJsonParse } from "@openagents/shared/utils";
import type { OrchestratorPlan, DataAgentResponse } from "./types.js";
import * as path from "path";
import * as fs from "fs";

/**
 * Estado del orchestrator graph
 */
const OrchestratorState = Annotation.Root({
  /** Prompt original del usuario */
  userPrompt: Annotation<string>,
  
  /** Plan generado por el planner */
  plan: Annotation<OrchestratorPlan | null>,
  
  /** Respuesta del data-agent */
  dataAgentResponse: Annotation<DataAgentResponse | null>,
  
  /** Mensaje final para el usuario */
  finalMessage: Annotation<string>,
  
  /** Error si ocurrió alguno */
  error: Annotation<string | null>,

  /** Cliente MCP del data-agent (compartido entre nodes) */
  mcpClient: Annotation<DataAgentMCPClient | null>,

  /** Prompt enviado al viz-agent */
  vizAgentPrompt: Annotation<string | null>,

  /** Respuesta del viz-agent */
  vizAgentResponse: Annotation<any>,

  /** Cliente MCP del viz-agent */
  vizMcpClient: Annotation<VizAgentMCPClient | null>,

  /** Carpeta del informe (para múltiples visualizaciones) */
  reportFolder: Annotation<string | null>,

  /** Lista de visualizaciones generadas en el informe */
  reportVisualizations: Annotation<string[]>,
});

/**
 * Node: Planner
 * Analiza el prompt del usuario y genera un plan
 */
const plannerNode = async (state: typeof OrchestratorState.State) => {
  try {
    console.error("\n[ORCHESTRATOR][PLANNER] Received user prompt");
    console.error(`[ORCHESTRATOR][PLANNER] USER_PROMPT: ${state.userPrompt}`);
    console.error("[ORCHESTRATOR][PLANNER] Analyzing with LLM");
    
    const systemPrompt = buildPlannerPrompt();
    const { rawText } = await streamStructuredPlan({
      systemPrompt,
      userPrompt: state.userPrompt,
    });

    const plan = safeJsonParse<OrchestratorPlan>(rawText);
    
    console.error(`[ORCHESTRATOR][PLANNER] Plan generated`);
    console.error(`[ORCHESTRATOR][PLANNER] Task type: ${plan.task}`);
    console.error(`[ORCHESTRATOR][PLANNER] Requires data-agent: ${!!plan.dataAgentPrompt}`);
    console.error(`[ORCHESTRATOR][PLANNER] Requires visualization: ${plan.needsVisualization}`);
    if (plan.rationale) {
      console.error(`[ORCHESTRATOR][PLANNER] Rationale: ${plan.rationale}`);
    }
    
    return {
      plan,
      error: null,
    };
  } catch (error) {
    console.error(`[ORCHESTRATOR][PLANNER] Error: ${error instanceof Error ? error.message : error}`);
    return {
      plan: null,
      error: error instanceof Error ? error.message : "Planning failed",
    };
  }
};

/**
 * Node: Data Fetcher
 * Ejecuta el data-agent vía MCP si es necesario
 */
const dataFetcherNode = async (state: typeof OrchestratorState.State) => {
  const plan = state.plan;
  
  // Si no hay plan o no necesita data-agent, skip
  if (!plan || !plan.dataAgentPrompt) {
    console.error("[ORCHESTRATOR][DATA-FETCHER] No data required, skipping");
    return {
      dataAgentResponse: null,
    };
  }

  let mcpClient = state.mcpClient;

  try {
    console.error("\n[ORCHESTRATOR][DATA-FETCHER] Initiating data fetch via MCP");
    console.error(`[ORCHESTRATOR][DATA-FETCHER] PROMPT_TO_DATA_AGENT: ${plan.dataAgentPrompt}`);
    
    // Detectar data provider del prompt
    const dataProvider = detectDataProvider(state.userPrompt) || 'cti';
    console.error(`[ORCHESTRATOR][DATA-FETCHER] Data provider: ${dataProvider}`);
    
    // Conectar al data-agent si no está conectado
    if (!mcpClient) {
      const dataAgentPath = process.env.DATA_AGENT_MCP_PATH;
      mcpClient = new DataAgentMCPClient(dataAgentPath);
      await mcpClient.connect();
    }
    
    // Llamar al data-agent con el provider
    const rawData = await mcpClient.queryMeasurements(plan.dataAgentPrompt, dataProvider);
    
    console.error("[ORCHESTRATOR][DATA-FETCHER] DATA_RECEIVED from data-agent");
    console.error(`[ORCHESTRATOR][DATA-FETCHER] Response size: ${JSON.stringify(rawData).length} bytes`);
    
    // Extraer el array de datos real del objeto de respuesta
    let actualData: any[] = [];
    if (rawData && rawData.apiResponse) {
      // apiResponse puede ser array o { raw: "..." }
      if (Array.isArray(rawData.apiResponse)) {
        actualData = rawData.apiResponse;
      } else if (rawData.apiResponse.raw) {
        // Intentar parsear si es string JSON
        try {
          const parsed = JSON.parse(rawData.apiResponse.raw);
          actualData = Array.isArray(parsed) ? parsed : [];
        } catch {
          actualData = [];
        }
      }
    }
    
    // Si apiResponse estaba vacío, intentar con toolResults[0].data
    if (actualData.length === 0 && rawData.toolResults && rawData.toolResults[0]) {
      const toolData = rawData.toolResults[0].data;
      if (Array.isArray(toolData)) {
        actualData = toolData;
      }
    }
    
    console.error(`[ORCHESTRATOR][DATA-FETCHER] Extracted ${actualData.length} data records`);
    
    return {
      dataAgentResponse: {
        success: actualData.length > 0,
        data: actualData,
        rawResponse: rawData, // Guardar la respuesta completa por si acaso
        metadata: {
          recordCount: actualData.length,
          measurement: rawData.plan?.measurement,
          sensorType: rawData.plan?.tagFilter?.sensorType,
        },
      },
      mcpClient,
      error: null,
    };
  } catch (error) {
    console.error(`[ORCHESTRATOR][DATA-FETCHER] Error: ${error instanceof Error ? error.message : error}`);
    
    // Intentar cerrar conexión en caso de error
    if (mcpClient) {
      try {
        await mcpClient.disconnect();
      } catch (e) {
        // Ignorar errores al desconectar
      }
    }
    
    return {
      dataAgentResponse: {
        success: false,
        error: error instanceof Error ? error.message : "Data fetching failed",
      },
      mcpClient: null,
      error: error instanceof Error ? error.message : "Data fetching failed",
    };
  }
};

/**
 * Node: Visualizer
 * Envía datos al viz-agent para crear visualización
 */
const visualizerNode = async (state: typeof OrchestratorState.State) => {
  const { userPrompt, plan, dataAgentResponse } = state;

  // Solo ejecutar si hay datos y se necesita visualización
  if (!plan?.needsVisualization || !dataAgentResponse?.success || !dataAgentResponse.data) {
    console.error("[ORCHESTRATOR][VISUALIZER] Skipping visualization (not needed or no data)");
    return {};
  }

  console.error("\n[ORCHESTRATOR][VISUALIZER] Starting visualization");

  let vizMcpClient: VizAgentMCPClient | null = null;

  try {
    // Detectar chartProvider del prompt del usuario (si se especifica)
    const chartProvider = detectChartProvider(userPrompt) || 'quickchart';
    console.error(`[ORCHESTRATOR][VISUALIZER] Using chart provider: ${chartProvider}`);
    
    // Detectar si hay múltiples campos en los datos
    const firstDataPoint = dataAgentResponse.data[0];
    const numericFields = firstDataPoint ? Object.keys(firstDataPoint).filter(key => 
      key !== 'timestamp' && key !== 'time' && key !== '_time' && 
      typeof firstDataPoint[key] === 'number'
    ) : [];
    
    const hasMultipleFields = numericFields.length > 1;
    const fieldsDescription = hasMultipleFields 
      ? `The data contains multiple fields to compare: ${numericFields.join(', ')}`
      : `The data contains the field: ${numericFields[0] || 'value'}`;
    
    // Construir prompt descriptivo para viz-agent
    const vizPrompt = `Create a visualization for the following data. 
The user asked: "${userPrompt}"
The data contains: ${dataAgentResponse.metadata?.measurement || 'measurements'} from ${dataAgentResponse.metadata?.sensorType || 'sensor'}
Total records: ${dataAgentResponse.metadata?.recordCount || dataAgentResponse.data.length}
${fieldsDescription}

${hasMultipleFields ? 'IMPORTANT: When comparing multiple fields, create separate lines/series for each field so they can be visually distinguished.' : ''}

Create an appropriate chart that clearly shows the data trends.`;

    console.error(`[ORCHESTRATOR][VISUALIZER] PROMPT_TO_VIZ_AGENT: ${vizPrompt}`);

    // Conectar al viz-agent
    const vizAgentPath = process.env.VIZ_AGENT_MCP_PATH || "../visualization-agent/dist/mcp-server.js";
    vizMcpClient = new VizAgentMCPClient(vizAgentPath);
    await vizMcpClient.connect();

    // Llamar al viz-agent con chartProvider
    const vizResponse = await vizMcpClient.createVisualization(
      vizPrompt,
      dataAgentResponse.data,
      plan.visualizationType || "line_chart",
      chartProvider
    );

    console.error("[ORCHESTRATOR][VISUALIZER] VISUALIZATION_RECEIVED:");
    if (vizResponse?.success) {
      console.error(`[ORCHESTRATOR][VISUALIZER] - Image path: ${vizResponse.imagePath}`);
      console.error(`[ORCHESTRATOR][VISUALIZER] - Chart type: ${vizResponse.plan?.chartType}`);
      console.error(`[ORCHESTRATOR][VISUALIZER] - Rationale: ${vizResponse.plan?.rationale}`);
    } else {
      console.error(`[ORCHESTRATOR][VISUALIZER] - Error: ${vizResponse?.error}`);
    }

    // Desconectar
    await vizMcpClient.disconnect();

    return {
      vizAgentPrompt: vizPrompt,
      vizAgentResponse: vizResponse,
      vizMcpClient: null,
    };

  } catch (error) {
    console.error(`[ORCHESTRATOR][VISUALIZER] Error: ${error instanceof Error ? error.message : error}`);
    
    if (vizMcpClient) {
      try {
        await vizMcpClient.disconnect();
      } catch (e) {
        // Ignorar errores al desconectar
      }
    }
    
    return {
      vizAgentResponse: {
        success: false,
        error: error instanceof Error ? error.message : "Visualization failed",
      },
      vizMcpClient: null,
    };
  }
};

/**
 * Node: Report Generator
 * Genera múltiples visualizaciones para crear un informe completo
 */
const reportGeneratorNode = async (state: typeof OrchestratorState.State) => {
  const { userPrompt, plan, dataAgentResponse } = state;

  // Solo ejecutar si es task generate_report y hay datos
  if (plan?.task !== 'generate_report' || !dataAgentResponse?.success || !dataAgentResponse.data) {
    console.error("[ORCHESTRATOR][REPORT-GEN] Skipping report generation (not report task or no data)");
    return {};
  }

  console.error("\n[ORCHESTRATOR][REPORT-GEN] Starting report generation with multiple visualizations");

  let vizMcpClient: VizAgentMCPClient | null = null;
  const visualizations: string[] = [];
  
  try {
    // Detectar chartProvider del prompt del usuario (si se especifica)
    const chartProvider = detectChartProvider(userPrompt) || 'quickchart';
    console.error(`[ORCHESTRATOR][REPORT-GEN] Using chart provider: ${chartProvider}`);
    
    // Crear carpeta del informe con timestamp
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
    const reportFolderName = `report_${timestamp}`;
    const reportFolderPath = path.join(process.cwd(), 'output', reportFolderName);
    
    // Crear la carpeta si no existe
    if (!fs.existsSync(reportFolderPath)) {
      fs.mkdirSync(reportFolderPath, { recursive: true });
      console.error(`[ORCHESTRATOR][REPORT-GEN] Created report folder: ${reportFolderPath}`);
    }

    // Conectar al viz-agent
    const vizAgentPath = process.env.VIZ_AGENT_MCP_PATH || "../visualization-agent/dist/mcp-server.js";
    vizMcpClient = new VizAgentMCPClient(vizAgentPath);
    await vizMcpClient.connect();
    console.error("[ORCHESTRATOR][REPORT-GEN] Connected to viz-agent");

    // Información de los datos
    const measurement = dataAgentResponse.metadata?.measurement || 'measurements';
    const sensorType = dataAgentResponse.metadata?.sensorType || 'sensor';
    const recordCount = dataAgentResponse.metadata?.recordCount || dataAgentResponse.data.length;

    // Definir las visualizaciones a generar
    const chartTypes: Array<{ type: string; title: string }> = [
      { 
        type: 'line_chart', 
        title: `${plan.reportTitle || 'Reporte'} - Evolución Temporal (Líneas)` 
      },
      { 
        type: 'bar_chart', 
        title: `${plan.reportTitle || 'Reporte'} - Comparativa (Barras)` 
      },
      { 
        type: 'pie_chart', 
        title: `${plan.reportTitle || 'Reporte'} - Distribución (Pastel)` 
      },
      { 
        type: 'table', 
        title: `${plan.reportTitle || 'Reporte'} - Datos Tabulados` 
      },
    ];

    console.error(`[ORCHESTRATOR][REPORT-GEN] Generating ${chartTypes.length} visualizations...`);

    // Generar cada visualización
    for (let i = 0; i < chartTypes.length; i++) {
      const chartDef = chartTypes[i];
      console.error(`[ORCHESTRATOR][REPORT-GEN] [${i + 1}/${chartTypes.length}] Creating ${chartDef.type}...`);

      try {
        const vizPrompt = `Create a ${chartDef.type} visualization for the following data.
The user asked: "${userPrompt}"
Chart title: "${chartDef.title}"
The data contains: ${measurement} from ${sensorType}
Total records: ${recordCount}

Create an appropriate ${chartDef.type} that clearly shows the data.`;

        // Llamar al viz-agent para esta visualización con chartProvider
        const vizResponse = await vizMcpClient.createVisualization(
          vizPrompt,
          dataAgentResponse.data,
          chartDef.type,
          chartProvider
        );

        if (vizResponse?.success && vizResponse.imagePath) {
          // Copiar/mover la imagen a la carpeta del informe
          const originalPath = vizResponse.imagePath;
          const fileName = `${i + 1}_${chartDef.type}_${path.basename(originalPath)}`;
          const destPath = path.join(reportFolderPath, fileName);

          // Copiar archivo
          if (fs.existsSync(originalPath)) {
            fs.copyFileSync(originalPath, destPath);
            visualizations.push(destPath);
            console.error(`[ORCHESTRATOR][REPORT-GEN] ✓ Saved: ${fileName}`);
          } else {
            console.error(`[ORCHESTRATOR][REPORT-GEN] ✗ Source file not found: ${originalPath}`);
          }
        } else {
          console.error(`[ORCHESTRATOR][REPORT-GEN] ✗ Failed to generate ${chartDef.type}: ${vizResponse?.error || 'Unknown error'}`);
        }

        // Pequeña pausa entre visualizaciones
        await new Promise(resolve => setTimeout(resolve, 500));

      } catch (chartError) {
        console.error(`[ORCHESTRATOR][REPORT-GEN] Error generating ${chartDef.type}: ${chartError instanceof Error ? chartError.message : chartError}`);
      }
    }

    // Desconectar
    await vizMcpClient.disconnect();
    console.error(`[ORCHESTRATOR][REPORT-GEN] Report complete: ${visualizations.length}/${chartTypes.length} visualizations generated`);

    return {
      reportFolder: reportFolderPath,
      reportVisualizations: visualizations,
      vizMcpClient: null,
    };

  } catch (error) {
    console.error(`[ORCHESTRATOR][REPORT-GEN] Error: ${error instanceof Error ? error.message : error}`);
    
    if (vizMcpClient) {
      try {
        await vizMcpClient.disconnect();
      } catch (e) {
        // Ignorar errores al desconectar
      }
    }
    
    return {
      reportFolder: null,
      reportVisualizations: [],
      vizMcpClient: null,
      error: error instanceof Error ? error.message : "Report generation failed",
    };
  }
};

/**
 * Node: Response Formatter
 * Formatea la respuesta final para el usuario
 */
const formatterNode = async (state: typeof OrchestratorState.State) => {
  const { plan, dataAgentResponse, vizAgentResponse, reportFolder, reportVisualizations, error } = state;

  console.error("\n[ORCHESTRATOR][FORMATTER] Formatting final response");

  // Si hubo error
  if (error) {
    console.error(`[ORCHESTRATOR][FORMATTER] Error detected: ${error}`);
    return {
      finalMessage: `Error: ${error}`,
    };
  }

  // Si no hay plan
  if (!plan) {
    console.error("[ORCHESTRATOR][FORMATTER] No plan available");
    return {
      finalMessage: "No plan could be generated for this request",
    };
  }

  // Si es una pregunta general (no necesita agentes)
  if (plan.task === "analyze_data" && !plan.dataAgentPrompt) {
    console.error("[ORCHESTRATOR][FORMATTER] General query, returning system info");
    return {
      finalMessage: `This system coordinates agents to fetch and visualize CTI electrical data.\n\n` +
        `Available agents:\n` +
        `- data-agent: Fetches electrical measurements\n` +
        `- viz-agent: Creates visualizations\n\n` +
        `Example: "Get temperature from transformer TR for the last 30 days"`,
    };
  }

  // Si se generó un informe (múltiples visualizaciones)
  if (plan.task === "generate_report" && reportFolder && reportVisualizations) {
    console.error(`[ORCHESTRATOR][FORMATTER] Report generated with ${reportVisualizations.length} visualizations`);
    
    const recordCount = dataAgentResponse?.metadata?.recordCount || 0;
    
    let message = `📊 Report generated successfully!\n\n`;
    message += `${plan.reportTitle || 'Data Report'}\n`;
    message += `${'='.repeat((plan.reportTitle || 'Data Report').length)}\n\n`;
    
    // Metadata
    if (dataAgentResponse?.metadata) {
      message += `Information:\n`;
      if (dataAgentResponse.metadata.measurement) {
        message += `- Measurement: ${dataAgentResponse.metadata.measurement}\n`;
      }
      if (dataAgentResponse.metadata.sensorType) {
        message += `- Sensor: ${dataAgentResponse.metadata.sensorType}\n`;
      }
      message += `- Total records: ${recordCount}\n`;
    }
    
    message += `\n📁 Report Folder: ${reportFolder}\n\n`;
    message += `📈 Visualizations Generated (${reportVisualizations.length}):\n`;
    
    reportVisualizations.forEach((vizPath, idx) => {
      const fileName = path.basename(vizPath);
      message += `  ${idx + 1}. ${fileName}\n`;
    });
    
    if (reportVisualizations.length === 0) {
      message += `  (No visualizations could be generated)\n`;
    }
    
    return {
      finalMessage: message,
    };
  }

  // Si se obtuvo data
  if (dataAgentResponse?.success && dataAgentResponse.data) {
    const data = dataAgentResponse.data;
    const recordCount = dataAgentResponse.metadata?.recordCount || 0;

    console.error(`[ORCHESTRATOR][FORMATTER] Data successfully obtained, ${recordCount} records`);

    let message = `Data obtained successfully\n\n`;
    
    // Mostrar metadata
    if (dataAgentResponse.metadata) {
      message += `Information:\n`;
      if (dataAgentResponse.metadata.measurement) {
        message += `- Measurement: ${dataAgentResponse.metadata.measurement}\n`;
      }
      if (dataAgentResponse.metadata.sensorType) {
        message += `- Sensor: ${dataAgentResponse.metadata.sensorType}\n`;
      }
      message += `- Total records: ${recordCount}\n`;
    }

    // NO mostrar el sample de datos JSON, solo el resumen
    // El usuario verá la cantidad de registros y puede acceder a los datos programáticamente si necesita

    // Si se generó visualización
    if (plan.needsVisualization) {
      if (vizAgentResponse?.success) {
        console.error("[ORCHESTRATOR][FORMATTER] Visualization created successfully");
        message += `\n\nVisualization created:\n`;
        message += `- File: ${vizAgentResponse.imagePath}\n`;
        message += `- Chart type: ${vizAgentResponse.plan?.chartType}\n`;
        message += `- Rationale: ${vizAgentResponse.plan?.rationale}\n`;
      } else {
        console.error("[ORCHESTRATOR][FORMATTER] Visualization failed");
        message += `\n\nNote: Visualization requested but failed: ${vizAgentResponse?.error || 'unknown error'}`;
      }
    }

    return {
      finalMessage: message,
    };
  }

  // Si data-agent reportó error
  if (dataAgentResponse && !dataAgentResponse.success) {
    console.error(`[ORCHESTRATOR][FORMATTER] Data-agent error: ${dataAgentResponse.error}`);
    return {
      finalMessage: `Error fetching data: ${dataAgentResponse.error}`,
    };
  }

  // Fallback
  console.error("[ORCHESTRATOR][FORMATTER] Task completed but no data to show");
  return {
    finalMessage: "Task completed but no data to show",
  };
};

/**
 * Construir el graph del orchestrator
 */
export function buildGraph() {
  // Función de ruteo después de dataFetcher
  const routeAfterDataFetch = (state: typeof OrchestratorState.State) => {
    // Si es un informe, ir al generador de informes
    if (state.plan?.task === 'generate_report') {
      console.error("[ORCHESTRATOR][ROUTER] Routing to reportGenerator");
      return "reportGenerator";
    }
    // Si necesita visualización simple, ir al visualizer
    if (state.plan?.needsVisualization) {
      console.error("[ORCHESTRATOR][ROUTER] Routing to visualizer");
      return "visualizer";
    }
    // Si no necesita visualización, ir directo al formatter
    console.error("[ORCHESTRATOR][ROUTER] Routing to formatter (no visualization needed)");
    return "formatter";
  };

  return new StateGraph(OrchestratorState)
    .addNode("planner", plannerNode)
    .addNode("dataFetcher", dataFetcherNode)
    .addNode("visualizer", visualizerNode)
    .addNode("reportGenerator", reportGeneratorNode)
    .addNode("formatter", formatterNode)
    .addEdge(START, "planner")
    .addEdge("planner", "dataFetcher")
    .addConditionalEdges("dataFetcher", routeAfterDataFetch, {
      "reportGenerator": "reportGenerator",
      "visualizer": "visualizer",
      "formatter": "formatter"
    })
    .addEdge("reportGenerator", "formatter")
    .addEdge("visualizer", "formatter")
    .addEdge("formatter", END)
    .compile();
}

/**
 * Helper function: Detect chart provider from user prompt
 * Busca palabras clave en el prompt que indiquen un proveedor específico
 * Si no se encuentra ninguno, retorna null (se usará quickchart por defecto)
 */
/**
 * Detecta si el usuario especifica un proveedor de datos en el prompt
 * Retorna null si no se detecta ninguno (default será "cti")
 */
function detectDataProvider(prompt: string): string | null {
  const lowerPrompt = prompt.toLowerCase();
  
  // Buscar keywords de data providers
  if (lowerPrompt.includes("postgres") || lowerPrompt.includes("postgresql")) {
    return "postgres";
  }
  if (lowerPrompt.includes("mongodb") || lowerPrompt.includes("mongo")) {
    return "mongodb";
  }
  if (lowerPrompt.includes("mysql")) {
    return "mysql";
  }
  if (lowerPrompt.includes("cti") || lowerPrompt.includes("ormazabal")) {
    return "cti";
  }
  
  // No se especificó provider, usar default
  return null;
}

/**
 * Detecta si el usuario especifica un proveedor de gráficas en el prompt
 * Retorna null si no se detecta ninguno (default será "quickchart")
 */
function detectChartProvider(prompt: string): string | null {
  const lowerPrompt = prompt.toLowerCase();
  
  // Buscar menciones explícitas de proveedores
  if (lowerPrompt.includes('quickchart')) {
    return 'quickchart';
  }
  
  if (lowerPrompt.includes('chartjs') || lowerPrompt.includes('chart.js')) {
    return 'chartjs';
  }
  
  if (lowerPrompt.includes('plotly')) {
    return 'plotly';
  }
  
  // Si no se especifica proveedor, retornar null (se usará el por defecto)
  return null;
}
