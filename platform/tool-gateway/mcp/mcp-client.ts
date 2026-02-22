import { IMcpClient, McpCallResult, McpToolDescriptor } from "./types";

// Stub client to define the contract. Replace with an actual transport (stdio/http/ws).
export class StubMcpClient implements IMcpClient {
  constructor(private readonly serverName: string) {}

  async listTools(): Promise<McpToolDescriptor[]> {
    void this.serverName;
    return [];
  }

  async callTool(
    toolName: string,
    input: Record<string, unknown>,
    traceId?: string
  ): Promise<McpCallResult> {
    void input;
    void traceId;
    return {
      ok: false,
      error: `MCP tool not implemented in stub client: ${toolName}`,
    };
  }
}
