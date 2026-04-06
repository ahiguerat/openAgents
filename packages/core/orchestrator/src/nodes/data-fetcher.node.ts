import { DataAgentMCPClient } from "../clients/data-agent-mcp-client.js";
import type { OrchestratorStateType } from "../state/orchestrator-state.js";

/**
 * Node: Data Fetcher
 * Ejecuta el data-agent vía MCP si es necesario
 */
export const dataFetcherNode = async (state: OrchestratorStateType) => {
  const plan = state.plan;
  
  // Si no hay plan o no necesita data-agent, skip
  if (!plan || !plan.dataAgentPrompt) {
    console.error("[ORCHESTRATOR][DATA-FETCHER] No data required, skipping");
    return {
      dataAgentResponse: null,
    };
  }

  try {
    console.error("\n[ORCHESTRATOR][DATA-FETCHER] Data required");
    console.error(`[ORCHESTRATOR][DATA-FETCHER] Data-agent prompt: ${plan.dataAgentPrompt}`);
    
    // Obtener path del MCP server desde env o usar default
    const mcpPath = process.env.DATA_AGENT_MCP_PATH;
    const mcpClient = new DataAgentMCPClient(mcpPath);
    
    // Conectar al data-agent
    await mcpClient.connect();
    
    // Llamar a query_cti_measurements (dataProvider es opcional)
    const dataAgentResponse = await mcpClient.queryMeasurements(plan.dataAgentPrompt);
    
    console.error("[ORCHESTRATOR][DATA-FETCHER] Data received");
    console.error(`[ORCHESTRATOR][DATA-FETCHER] Response keys: ${Object.keys(dataAgentResponse || {}).join(", ")}`);
    
    return {
      dataAgentResponse,
      mcpClient,
      error: null,
    };
  } catch (error) {
    console.error(`[ORCHESTRATOR][DATA-FETCHER] Error: ${error instanceof Error ? error.message : error}`);
    return {
      dataAgentResponse: null,
      error: error instanceof Error ? error.message : "Data fetching failed",
    };
  }
};
