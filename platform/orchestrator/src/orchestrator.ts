import { randomUUID } from "node:crypto";
import path from "node:path";
import type { LLMClient } from "@openagents/llm-client";
import { AgentRuntime, type AgentResult } from "@openagents/runtime";
import { ToolRegistry, FilesystemReadAdapter, FilesystemWriteAdapter } from "@openagents/tool-gateway";
import type { OrchestratorLogger } from "./logger";
import type { Task, TaskStatus } from "./types";

export interface OrchestratorOptions {
  llmClient: LLMClient;
  sandboxRoot: string;
  skillDir: string;
  logger: OrchestratorLogger;
}

export class Orchestrator {
  private readonly tasks = new Map<string, Task>();
  private readonly runtime: AgentRuntime;

  constructor(private readonly opts: OrchestratorOptions) {
    const toolRegistry = new ToolRegistry();
    toolRegistry.register(new FilesystemReadAdapter(opts.sandboxRoot));
    toolRegistry.register(new FilesystemWriteAdapter(opts.sandboxRoot));

    this.runtime = new AgentRuntime({
      llmClient: opts.llmClient,
      toolRegistry,
      defaultSkillDir: opts.skillDir,
    });
  }

  // ── submit_task ─────────────────────────────────────────────────────────────
  submitTask(goal: string): string {
    const taskId = randomUUID();
    const traceId = randomUUID();

    const task: Task = {
      id: taskId,
      traceId,
      goal,
      status: "pending",
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    this.tasks.set(taskId, task);
    this.transition(task, "pending");

    // Ejecutar en background sin bloquear
    this.runTask(task).catch((err) => {
      this.transitionError(task, err instanceof Error ? err.message : String(err));
    });

    return taskId;
  }

  // ── get_task_status ──────────────────────────────────────────────────────────
  getTaskStatus(taskId: string): Pick<Task, "id" | "status" | "createdAt" | "updatedAt" | "blockedReason"> | null {
    const task = this.tasks.get(taskId);
    if (!task) return null;
    return {
      id: task.id,
      status: task.status,
      createdAt: task.createdAt,
      updatedAt: task.updatedAt,
      blockedReason: task.blockedReason,
    };
  }

  // ── get_task_result ──────────────────────────────────────────────────────────
  getTaskResult(taskId: string): AgentResult | null {
    const task = this.tasks.get(taskId);
    if (!task || !task.result) return null;
    return task.result;
  }

  // ── resume_task ──────────────────────────────────────────────────────────────
  resumeTask(taskId: string, input: string): boolean {
    const task = this.tasks.get(taskId);
    if (!task || task.status !== "blocked") return false;

    task.resumeInput = input;
    this.transition(task, "running");

    // Reejecutar con el input adicional
    this.runTask(task, input).catch((err) => {
      this.transitionError(task, err instanceof Error ? err.message : String(err));
    });

    return true;
  }

  // ── Ejecución interna ────────────────────────────────────────────────────────
  private async runTask(task: Task, resumeInput?: string): Promise<void> {
    this.transition(task, "running");

    // El Orchestrator razona primero: decide si puede ejecutar directamente
    // o si necesita más información del usuario (human-in-the-loop)
    const goal = resumeInput
      ? `${task.goal}\n\nInformación adicional del usuario: ${resumeInput}`
      : task.goal;

    // Paso 1: El Orchestrator LLM razona sobre si puede proceder o necesita clarificación
    const orchestratorResponse = await this.opts.llmClient.chat({
      system: `Eres el Orchestrator de openAgents. Tu rol es analizar el goal del usuario y decidir si:
1. Puedes proceder directamente a ejecutar la tarea (responde con JSON: {"action": "execute"})
2. Necesitas más información del usuario para poder ejecutarla (responde con JSON: {"action": "clarify", "question": "<pregunta concisa>"})

Responde ÚNICAMENTE con el JSON, sin texto adicional.`,
      messages: [{ role: "user", content: goal }],
      tools: [],
    });

    // Parsear decisión del Orchestrator
    let action: "execute" | "clarify" = "execute";
    let question: string | undefined;

    try {
      const text = orchestratorResponse.text?.trim() ?? "";
      // Extraer JSON aunque venga envuelto en markdown
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]) as { action: string; question?: string };
        if (parsed.action === "clarify" && parsed.question) {
          action = "clarify";
          question = parsed.question;
        }
      }
    } catch {
      // Si no puede parsear, ejecuta directamente
    }

    if (action === "clarify" && question) {
      this.transition(task, "blocked", question);
      return;
    }

    // Paso 2: Delegar en Agent Runtime
    const result = await this.runtime.run({
      taskId: task.id,
      traceId: task.traceId,
      goal,
    });

    task.result = result;
    this.transition(task, result.status === "completed" ? "completed" : "failed");
  }

  // ── Helpers de estado ────────────────────────────────────────────────────────
  private transition(task: Task, status: TaskStatus, blockedReason?: string): void {
    task.status = status;
    task.updatedAt = new Date();
    if (blockedReason) task.blockedReason = blockedReason;

    this.opts.logger.log({
      level: "info",
      message: `Task ${status}`,
      taskId: task.id,
      traceId: task.traceId,
      status,
      ...(blockedReason ? { blockedReason } : {}),
    });
  }

  private transitionError(task: Task, error: string): void {
    task.status = "failed";
    task.updatedAt = new Date();

    this.opts.logger.log({
      level: "error",
      message: "Task failed",
      taskId: task.id,
      traceId: task.traceId,
      status: "failed",
      error,
    });
  }
}
