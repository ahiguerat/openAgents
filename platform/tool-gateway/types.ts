export type ToolSideEffects = "none" | "fs" | "network" | "external";

export interface ToolSpec {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  outputSchema: Record<string, unknown>;
  permissions: string[];
  sideEffects: ToolSideEffects;
}

export interface ToolInvocation {
  toolName: string;
  input: Record<string, unknown>;
  taskId: string;
  traceId?: string;
}

export interface ToolResult {
  ok: boolean;
  output?: Record<string, unknown>;
  error?: string;
}

export interface IToolAdapter {
  spec: ToolSpec;
  invoke(input: Record<string, unknown>, traceId?: string): Promise<ToolResult>;
}

export interface ToolInvocationLog {
  level: "info" | "error";
  message: string;
  toolName: string;
  taskId: string;
  traceId?: string;
  input?: Record<string, unknown>;
  output?: Record<string, unknown>;
  error?: string;
}

export interface ToolGatewayLogger {
  log(entry: ToolInvocationLog): void;
}
