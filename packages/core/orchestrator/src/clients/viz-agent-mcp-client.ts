import { GenericMCPClient } from "@openagents/shared";

export class VizAgentMCPClient extends GenericMCPClient {
  constructor(vizAgentPath?: string) {
    super({
      name: "orchestrator-viz-client",
      version: "0.1.0",
      serverPath: vizAgentPath || "../visualization-agent/dist/mcp-server.js",
      logPrefix: "ORCHESTRATOR][VIZ-CLIENT",
    });
  }

  async createVisualization(
    prompt: string,
    data: any,
    suggestedType?: string,
    chartProvider?: string
  ): Promise<any> {
    this.log(`Prompt: ${prompt}`);
    this.log(`Data size: ${JSON.stringify(data).length} bytes`);
    if (chartProvider) {
      this.log(`Chart provider: ${chartProvider}`);
    }

    return this.callTool("create_visualization", {
      prompt,
      data,
      suggestedType,
      chartProvider,
    });
  }
}