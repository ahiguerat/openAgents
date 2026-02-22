import { ToolRegistry } from "../tool-registry";
import { McpToolAdapter } from "./mcp-tool-adapter";
import { IMcpClient } from "./types";

export async function registerMcpTools(
  registry: ToolRegistry,
  client: IMcpClient,
  permissionsByTool: Record<string, string[]> = {}
): Promise<string[]> {
  const descriptors = await client.listTools();

  for (const descriptor of descriptors) {
    const permissions = permissionsByTool[descriptor.name] ?? ["mcp:invoke"];
    registry.register(new McpToolAdapter(client, descriptor, permissions));
  }

  return descriptors.map((t) => t.name);
}
