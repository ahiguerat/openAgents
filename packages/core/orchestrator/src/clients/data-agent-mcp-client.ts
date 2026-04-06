import { GenericMCPClient } from "@openagents/shared";

/**
 * Cliente MCP para comunicarse con el data-agent
 */
export class DataAgentMCPClient extends GenericMCPClient {
  constructor(dataAgentPath?: string) {
    super({
      name: "orchestrator-mcp-client",
      version: "0.1.0",
      serverPath: dataAgentPath || "../data-agent/dist/mcp-server.js",
      logPrefix: "ORCHESTRATOR][MCP-CLIENT",
    });
  }

  /**
   * Consultar mediciones usando un data provider específico
   */
  async queryMeasurements(query: string, dataProvider?: string): Promise<any> {
    this.log(`Query: ${query}`);
    this.log(`Provider: ${dataProvider || "cti (default)"}`);

    return this.callTool("query_cti_measurements", {
      query,
      ...(dataProvider && { dataProvider }),
    });
  }
}
