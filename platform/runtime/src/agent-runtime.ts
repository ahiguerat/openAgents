import type { LLMClient, ChatMessage, ToolSpec, ToolCall } from "@openagents/llm-client";
import type { ToolRegistry } from "@openagents/tool-gateway";
import { loadSkill } from "./skill-loader";
import type { AgentTask, AgentResult } from "./types";

const MAX_ITERATIONS = 20;

/** filesystem.read → filesystem_read (la API de Anthropic no permite puntos) */
function toApiName(name: string): string {
  return name.replace(/\./g, "__dot__");
}

/** filesystem_read → filesystem.read */
function fromApiName(name: string): string {
  return name.replace(/__dot__/g, ".");
}

export interface AgentRuntimeOptions {
  llmClient: LLMClient;
  toolRegistry: ToolRegistry;
  /** Directorio raíz de skills (se usa si AgentTask no especifica skillDir) */
  defaultSkillDir?: string;
}

export class AgentRuntime {
  constructor(private readonly opts: AgentRuntimeOptions) {}

  async run(task: AgentTask): Promise<AgentResult> {
    // ── 1. Cargar skill ──────────────────────────────────────────────────────
    let systemPrompt = "Eres un agente de propósito general. Completa la tarea del usuario.";

    const skillDir = task.skillDir ?? this.opts.defaultSkillDir;
    if (skillDir) {
      try {
        const skill = await loadSkill(skillDir);
        systemPrompt = skill.systemPrompt;
      } catch {
        // Si la skill no se puede cargar, continuamos con el system prompt por defecto
      }
    }

    // ── 2. Construir contexto inicial ────────────────────────────────────────
    // La API de Anthropic solo permite [a-zA-Z0-9_-] en nombres de tools.
    // Normalizamos los puntos a guiones bajos para el LLM y revertimos al ejecutar.
    const toolSpecs: ToolSpec[] = this.opts.toolRegistry.getToolSpecs().map((spec) => ({
      name: toApiName(spec.name),
      description: spec.description,
      input_schema: spec.inputSchema,
    }));

    const messages: ChatMessage[] = [
      { role: "user", content: task.goal },
    ];

    // ── 3. Loop de tool use ──────────────────────────────────────────────────
    let iterations = 0;

    while (iterations < MAX_ITERATIONS) {
      iterations++;

      const response = await this.opts.llmClient.chat({
        system: systemPrompt,
        messages,
        tools: toolSpecs,
      });

      // Añadir respuesta del asistente al historial
      if (response.toolCalls.length > 0) {
        messages.push({
          role: "assistant",
          content: [
            ...(response.text ? [{ type: "text" as const, text: response.text }] : []),
            ...response.toolCalls.map((tc) => ({
              type: "tool_use" as const,
              id: tc.id,
              name: tc.name,
              input: tc.input,
            })),
          ],
        });

        // Ejecutar tool calls y añadir resultados
        const toolResults = await Promise.all(
          response.toolCalls.map((tc) => this.executeTool(tc, task))
        );

        messages.push({
          role: "user",
          content: toolResults.map((result, i) => ({
            type: "tool_result" as const,
            tool_use_id: response.toolCalls[i]!.id,
            content: result,
          })),
        });
      } else {
        // end_turn — el agente ha terminado
        messages.push({
          role: "assistant",
          content: response.text ?? "",
        });
        break;
      }

      if (response.stopReason === "end_turn") break;
    }

    // ── 4. Construir resultado ───────────────────────────────────────────────
    // Buscar el último mensaje del asistente para el summary
    const lastAssistantMessage = [...messages].reverse().find((m) => m.role === "assistant");
    let summary = "Tarea completada.";
    if (lastAssistantMessage) {
      if (typeof lastAssistantMessage.content === "string") {
        summary = lastAssistantMessage.content || "Tarea completada.";
      } else if (Array.isArray(lastAssistantMessage.content)) {
        const textBlock = lastAssistantMessage.content.find((b) => b.type === "text");
        if (textBlock && "text" in textBlock) {
          summary = textBlock.text as string;
        }
      }
    }

    return {
      taskId: task.taskId,
      status: "completed",
      summary,
      artifacts: [],
    };
  }

    private async executeTool(tc: ToolCall, task: AgentTask): Promise<string> {
    const result = await this.opts.toolRegistry.invoke(
      fromApiName(tc.name),
      tc.input,
      task.taskId,
      task.traceId
    );

    if (result.ok) {
      return JSON.stringify(result.output ?? {});
    }

    return `Error: ${result.error ?? "Tool execution failed"}`;
  }
}
