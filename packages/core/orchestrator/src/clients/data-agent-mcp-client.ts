import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

/**
 * Cliente MCP para comunicarse con el data-agent
 */
export class DataAgentMCPClient {
  private client: Client | null = null;
  private transport: StdioClientTransport | null = null;
  private dataAgentPath: string;

  constructor(dataAgentPath?: string) {
    // Por defecto, usar el path relativo al data-agent MCP server
    this.dataAgentPath = dataAgentPath || "../data-agent/dist/mcp-server.js";
  }

  /**
   * Conectar al data-agent MCP server
   */
  async connect(): Promise<void> {
    if (this.client) {
      console.log("[ORCHESTRATOR][MCP-CLIENT] Already connected");
      return;
    }

    console.log(`[ORCHESTRATOR][MCP-CLIENT] Connecting to data-agent at: ${this.dataAgentPath}`);

    // Crear transport stdio que spawneará el proceso
    this.transport = new StdioClientTransport({
      command: "node",
      args: [this.dataAgentPath],
      env: process.env as Record<string, string>,
    });

    // Crear cliente
    this.client = new Client(
      {
        name: "orchestrator-mcp-client",
        version: "0.1.0",
      },
      {
        capabilities: {},
      }
    );

    // Conectar
    await this.client.connect(this.transport);
    console.log("[ORCHESTRATOR][MCP-CLIENT] Connected successfully");

    // Listar tools disponibles
    const tools = await this.client.listTools();
    console.log(`[ORCHESTRATOR][MCP-CLIENT] Available tools: ${tools.tools.map(t => t.name).join(", ")}`);
  }

  /**
   * Consultar mediciones usando un data provider específico
   */
  async queryMeasurements(query: string, dataProvider?: string): Promise<any> {
    if (!this.client) {
      throw new Error("MCP client not connected. Call connect() first.");
    }

    console.error(`[ORCHESTRATOR][MCP-CLIENT] Calling data-agent tool: query_cti_measurements`);
    console.error(`[ORCHESTRATOR][MCP-CLIENT] Query: ${query}`);
    console.error(`[ORCHESTRATOR][MCP-CLIENT] Provider: ${dataProvider || 'cti (default)'}`);

    try {
      // Crear timeout personalizado de 5 minutos para consultas largas a la API
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error("Data query request timed out after 5 minutes")), 300000);
      });

      const callPromise = this.client.callTool({
        name: "query_cti_measurements",
        arguments: {
          query,
          ...(dataProvider && { dataProvider }),
        },
      });

      // Race entre la llamada y el timeout
      const result = await Promise.race([callPromise, timeoutPromise]) as any;

      console.error("[ORCHESTRATOR][MCP-CLIENT] Data-agent response received");

      // El resultado viene en result.content
      if (result.content && Array.isArray(result.content) && result.content.length > 0) {
        const content = result.content[0];
        
        if (content.type === "text") {
          // Parsear el JSON del texto
          try {
            return JSON.parse(content.text);
          } catch (e) {
            // Si no es JSON, retornar el texto crudo
            return { raw: content.text };
          }
        }

        return content;
      }

      return null;
    } catch (error) {
      console.error(`[ORCHESTRATOR][MCP-CLIENT] Error calling data-agent: ${error instanceof Error ? error.message : error}`);
      throw error;
    }
  }

  /**
   * Cerrar conexión
   */
  async disconnect(): Promise<void> {
    if (this.client) {
      console.error("[ORCHESTRATOR][MCP-CLIENT] Disconnecting");
      await this.client.close();
      this.client = null;
      this.transport = null;
      console.error("[ORCHESTRATOR][MCP-CLIENT] Disconnected");
    }
  }
}
