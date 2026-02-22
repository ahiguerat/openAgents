import { IToolAdapter, ToolInvocation, ToolResult } from "./types";

export class ToolRegistry {
  private readonly adapters = new Map<string, IToolAdapter>();

  register(adapter: IToolAdapter): void {
    if (this.adapters.has(adapter.spec.name)) {
      throw new Error(`Tool already registered: ${adapter.spec.name}`);
    }
    this.adapters.set(adapter.spec.name, adapter);
  }

  listToolNames(): string[] {
    return [...this.adapters.keys()].sort();
  }

  async invoke(invocation: ToolInvocation): Promise<ToolResult> {
    const adapter = this.adapters.get(invocation.toolName);
    if (!adapter) {
      return { ok: false, error: `Unknown tool: ${invocation.toolName}` };
    }

    return adapter.invoke(invocation.input, invocation.traceId);
  }
}
