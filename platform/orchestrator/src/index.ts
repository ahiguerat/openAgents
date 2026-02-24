import path from "node:path";
import { Hono } from "hono";
import { createLLMClient } from "@openagents/llm-client";
import { ConsoleLogger } from "./logger";
import { Orchestrator } from "./orchestrator";

// ── Configuración ─────────────────────────────────────────────────────────────
const apiKey = process.env.OPENROUTER_API_KEY;
if (!apiKey) {
  console.error(JSON.stringify({ level: "error", message: "OPENROUTER_API_KEY is not set" }));
  process.exit(1);
}

const sandboxRoot = path.resolve(process.env.SANDBOX_ROOT ?? "tmp/sandbox");
const skillDir = path.resolve(process.env.SKILL_DIR ?? "skills/general-assistant");
const port = Number(process.env.PORT ?? 3000);

// ── Dependencias ──────────────────────────────────────────────────────────────
const llmClient = createLLMClient({ apiKey });
const logger = new ConsoleLogger();
const orchestrator = new Orchestrator({ llmClient, sandboxRoot, skillDir, logger });

// ── API Hono ──────────────────────────────────────────────────────────────────
const app = new Hono();

// POST /tasks — submit_task
app.post("/tasks", async (c) => {
  const body = await c.req.json<{ goal?: string }>();
  const goal = body.goal?.trim();

  if (!goal) {
    return c.json({ error: "goal is required" }, 400);
  }

  const taskId = orchestrator.submitTask(goal);
  return c.json({ task_id: taskId }, 202);
});

// GET /tasks/:id/status — get_task_status
app.get("/tasks/:id/status", (c) => {
  const status = orchestrator.getTaskStatus(c.req.param("id"));
  if (!status) return c.json({ error: "Task not found" }, 404);
  return c.json(status);
});

// GET /tasks/:id/result — get_task_result
app.get("/tasks/:id/result", (c) => {
  const taskStatus = orchestrator.getTaskStatus(c.req.param("id"));
  if (!taskStatus) return c.json({ error: "Task not found" }, 404);

  if (taskStatus.status !== "completed" && taskStatus.status !== "failed") {
    return c.json({ error: "Task is not finished yet", status: taskStatus.status }, 409);
  }

  const result = orchestrator.getTaskResult(c.req.param("id"));
  if (!result) return c.json({ error: "Result not available" }, 404);
  return c.json(result);
});

// POST /tasks/:id/resume — resume_task
app.post("/tasks/:id/resume", async (c) => {
  const body = await c.req.json<{ input?: string }>();
  const input = body.input?.trim();

  if (!input) {
    return c.json({ error: "input is required" }, 400);
  }

  const ok = orchestrator.resumeTask(c.req.param("id"), input);
  if (!ok) return c.json({ error: "Task not found or not blocked" }, 404);
  return c.json({ resumed: true });
});

// ── Arranque ──────────────────────────────────────────────────────────────────
logger.log({
  level: "info",
  message: `openAgents orchestrator starting on port ${port}`,
  taskId: "system",
  traceId: "system",
});

export default {
  port,
  fetch: app.fetch,
};
