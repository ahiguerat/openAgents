export interface McpToolDescriptor {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

export interface McpCallResult {
  ok: boolean;
  content?: Record<string, unknown>;
  error?: string;
}

export interface IMcpClient {
  listTools(): Promise<McpToolDescriptor[]>;
  callTool(
    toolName: string,
    input: Record<string, unknown>,
    traceId?: string
  ): Promise<McpCallResult>;
}
