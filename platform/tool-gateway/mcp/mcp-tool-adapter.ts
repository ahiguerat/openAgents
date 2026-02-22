import { IToolAdapter, ToolResult, ToolSpec } from "../types";
import { IMcpClient, McpToolDescriptor } from "./types";

export class McpToolAdapter implements IToolAdapter {
  public readonly spec: ToolSpec;

  constructor(
    private readonly client: IMcpClient,
    descriptor: McpToolDescriptor,
    permissions: string[] = ["mcp:invoke"]
  ) {
    this.spec = {
      name: descriptor.name,
      description: descriptor.description,
      inputSchema: descriptor.inputSchema,
      outputSchema: {
        type: "object",
        additionalProperties: true,
      },
      permissions,
      sideEffects: "external",
    };
  }

  async invoke(input: Record<string, unknown>, traceId?: string): Promise<ToolResult> {
    const result = await this.client.callTool(this.spec.name, input, traceId);

    if (!result.ok) {
      return {
        ok: false,
        error: result.error ?? `MCP call failed: ${this.spec.name}`,
      };
    }

    return {
      ok: true,
      output: result.content ?? {},
    };
  }
}
