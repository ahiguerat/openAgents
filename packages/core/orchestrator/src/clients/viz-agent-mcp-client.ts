import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

export class VizAgentMCPClient {
  private client: Client | null = null;
  private transport: StdioClientTransport | null = null;
  private vizAgentPath: string;

  constructor(vizAgentPath?: string) {
    this.vizAgentPath = vizAgentPath || "../visualization-agent/dist/mcp-server.js";
  }

  async connect(): Promise<void> {
    if (this.client) {
      console.error("[ORCHESTRATOR][VIZ-CLIENT] Already connected");
      return;
    }

    console.error(`[ORCHESTRATOR][VIZ-CLIENT] Connecting to viz-agent: ${this.vizAgentPath}`);

    this.transport = new StdioClientTransport({
      command: "node",
      args: [this.vizAgentPath],
      env: process.env as Record<string, string>,
    });

    this.client = new Client(
      { name: "orchestrator-viz-client", version: "0.1.0" },
      { capabilities: {} }
    );

    await this.client.connect(this.transport);
    console.error("[ORCHESTRATOR][VIZ-CLIENT] Connected successfully");

    const tools = await this.client.listTools();
    console.error(`[ORCHESTRATOR][VIZ-CLIENT] Available tools: ${tools.tools.map((t: any) => t.name).join(", ")}`);
  }

  async createVisualization(prompt: string, data: any, suggestedType?: string): Promise<any> {
    if (!this.client) {
      throw new Error("MCP client not connected");
    }

    console.error(`[ORCHESTRATOR][VIZ-CLIENT] Calling create_visualization`);
    console.error(`[ORCHESTRATOR][VIZ-CLIENT] Prompt: ${prompt}`);
    console.error(`[ORCHESTRATOR][VIZ-CLIENT] Data size: ${JSON.stringify(data).length} bytes`);

    // Crear timeout personalizado de 5 minutos para visualizaciones con muchos datos
    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => reject(new Error("Visualization request timed out after 5 minutes")), 300000);
    });

    const callPromise = this.client.callTool({
      name: "create_visualization",
      arguments: { prompt, data, suggestedType },
    });

    // Race entre la llamada y el timeout
    const result = await Promise.race([callPromise, timeoutPromise]) as any;

    if (result.content && Array.isArray(result.content) && result.content.length > 0) {
      const content = result.content[0];
      if (content.type === "text") {
        return JSON.parse(content.text);
      }
    }
    return null;
  }

  async disconnect(): Promise<void> {
    if (this.client) {
      console.error("[ORCHESTRATOR][VIZ-CLIENT] Disconnecting");
      await this.client.close();
      this.client = null;
      console.error("[ORCHESTRATOR][VIZ-CLIENT] Disconnected");
    }
  }
}