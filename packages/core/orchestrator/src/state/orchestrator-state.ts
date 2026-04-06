import { Annotation } from "@langchain/langgraph";
import type { OrchestratorPlan, DataAgentResponse } from "../types.js";
import type { DataAgentMCPClient } from "../clients/data-agent-mcp-client.js";
import type { VizAgentMCPClient } from "../clients/viz-agent-mcp-client.js";

/**
 * Estado del orchestrator graph
 */
export const OrchestratorState = Annotation.Root({
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

export type OrchestratorStateType = typeof OrchestratorState.State;
