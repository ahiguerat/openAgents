/**
 * Tipos para el orchestrator
 */

/**
 * Plan que el orchestrator genera después de analizar el prompt del usuario
 */
export interface OrchestratorPlan {
  /** Tarea principal a realizar */
  task: "fetch_data" | "visualize_data" | "analyze_data" | "multi_step" | "generate_report";
  
  /** Prompt específico para el data-agent */
  dataAgentPrompt?: string;
  
  /** ¿Se necesita visualización después? */
  needsVisualization: boolean;
  
  /** Tipo de visualización si se necesita */
  visualizationType?: "line_chart" | "bar_chart" | "scatter" | "table" | "pie_chart";
  
  /** Razonamiento del orchestrator */
  rationale?: string;
  
  /** Si es un informe, título descriptivo */
  reportTitle?: string;
}

/**
 * Respuesta del data-agent
 */
export interface DataAgentResponse {
  success: boolean;
  data?: any;
  error?: string;
  metadata?: {
    measurement?: string;
    sensorType?: string;
    recordCount?: number;
  };
}

/**
 * Respuesta final del orchestrator al usuario
 */
export interface OrchestratorResponse {
  success: boolean;
  message: string;
  data?: any;
  visualization?: string; // Path o URL a la visualización
  reportFolder?: string; // Path a la carpeta del informe (para múltiples visualizaciones)
  visualizations?: string[]; // Lista de paths de visualizaciones generadas
  error?: string;
}

/**
 * Resultado de ejecutar un agente
 */
export interface AgentExecutionResult {
  agent: "data-agent" | "viz-agent";
  success: boolean;
  output?: any;
  error?: string;
  executionTime: number;
}
