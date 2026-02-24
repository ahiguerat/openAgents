import Ajv, { ValidateFunction } from "ajv";
import {
  IToolAdapter,
  ToolGatewayLogger,
  ToolInvocation,
  ToolResult,
  ToolSpec,
} from "./types";

export class ToolRegistry {
  private readonly adapters = new Map<string, IToolAdapter>();
  private readonly ajv = new Ajv({ allErrors: true, strict: false });
  private readonly inputValidators = new Map<string, ValidateFunction>();
  private readonly outputValidators = new Map<string, ValidateFunction>();

  constructor(private readonly logger?: ToolGatewayLogger) {}

  register(adapter: IToolAdapter): void {
    if (this.adapters.has(adapter.spec.name)) {
      throw new Error(`Tool already registered: ${adapter.spec.name}`);
    }
    this.adapters.set(adapter.spec.name, adapter);
  }

  listToolNames(): string[] {
    return [...this.adapters.keys()].sort();
  }

  getToolSpecs(): ToolSpec[] {
    return [...this.adapters.values()]
      .map((adapter) => adapter.spec)
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  async invoke(invocation: ToolInvocation): Promise<ToolResult>;
  async invoke(
    toolName: string,
    input: Record<string, unknown>,
    taskId: string,
    traceId?: string
  ): Promise<ToolResult>;
  async invoke(
    invocationOrToolName: ToolInvocation | string,
    input?: Record<string, unknown>,
    taskId?: string,
    traceId?: string
  ): Promise<ToolResult> {
    const invocation =
      typeof invocationOrToolName === "string"
        ? ({
            toolName: invocationOrToolName,
            input: input ?? {},
            taskId: taskId ?? "unknown-task",
            traceId,
          } satisfies ToolInvocation)
        : invocationOrToolName;

    const adapter = this.adapters.get(invocation.toolName);
    if (!adapter) {
      const error = `Unknown tool: ${invocation.toolName}`;
      this.logError(invocation, error);
      return { ok: false, error };
    }

    if (!this.validateInput(adapter.spec, invocation.input)) {
      const validate = this.getInputValidator(adapter.spec);
      const error = `Invalid input for tool ${adapter.spec.name}: ${this.ajv.errorsText(
        validate.errors
      )}`;
      this.logError(invocation, error);
      return { ok: false, error };
    }

    const result = await adapter.invoke(invocation.input, invocation.traceId);

    if (result.ok) {
      const output = result.output ?? {};
      if (!this.validateOutput(adapter.spec, output)) {
        const validate = this.getOutputValidator(adapter.spec);
        const error = `Invalid output for tool ${adapter.spec.name}: ${this.ajv.errorsText(
          validate.errors
        )}`;
        this.logError(invocation, error, output);
        return { ok: false, error };
      }

      this.logInfo(invocation, output);
      return { ok: true, output };
    }

    this.logError(invocation, result.error ?? "Tool invocation failed");
    return result;
  }

  private getInputValidator(spec: ToolSpec): ValidateFunction {
    let validator = this.inputValidators.get(spec.name);
    if (!validator) {
      validator = this.ajv.compile(spec.inputSchema);
      this.inputValidators.set(spec.name, validator);
    }
    return validator;
  }

  private getOutputValidator(spec: ToolSpec): ValidateFunction {
    let validator = this.outputValidators.get(spec.name);
    if (!validator) {
      validator = this.ajv.compile(spec.outputSchema);
      this.outputValidators.set(spec.name, validator);
    }
    return validator;
  }

  private validateInput(spec: ToolSpec, input: Record<string, unknown>): boolean {
    return Boolean(this.getInputValidator(spec)(input));
  }

  private validateOutput(spec: ToolSpec, output: Record<string, unknown>): boolean {
    return Boolean(this.getOutputValidator(spec)(output));
  }

  private logInfo(invocation: ToolInvocation, output: Record<string, unknown>): void {
    this.logger?.log({
      level: "info",
      message: "Tool invocation succeeded",
      toolName: invocation.toolName,
      taskId: invocation.taskId,
      traceId: invocation.traceId,
      input: invocation.input,
      output,
    });
  }

  private logError(
    invocation: ToolInvocation,
    error: string,
    output?: Record<string, unknown>
  ): void {
    this.logger?.log({
      level: "error",
      message: "Tool invocation failed",
      toolName: invocation.toolName,
      taskId: invocation.taskId,
      traceId: invocation.traceId,
      input: invocation.input,
      output,
      error,
    });
  }
}
