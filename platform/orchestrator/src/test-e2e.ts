/**
 * Test E2E — Bloque 6
 *
 * Arranca el Orchestrator en un puerto dedicado, ejecuta los 4 escenarios
 * definidos en la issue y verifica resultados y logs.
 *
 * Uso: bun --env-file=.env platform/orchestrator/src/test-e2e.ts
 */
import path from "node:path";
import { rm, mkdir } from "node:fs/promises";
import { createLLMClient } from "@openagents/llm-client";
import { ConsoleLogger, type OrchestratorLogEntry } from "./logger";
import { Orchestrator } from "./orchestrator";

// ── Setup ─────────────────────────────────────────────────────────────────────

const apiKey = process.env.OPENROUTER_API_KEY;
if (!apiKey) { console.error("OPENROUTER_API_KEY not set"); process.exit(1); }

const sandboxRoot = path.resolve("tmp/e2e-sandbox");
const skillDir = path.resolve("skills/general-assistant");

await rm(sandboxRoot, { recursive: true, force: true });
await mkdir(sandboxRoot, { recursive: true });

// Logger que captura las entradas para verificar task_id y trace_id
class CapturingLogger extends ConsoleLogger {
  public readonly entries: OrchestratorLogEntry[] = [];
  override log(entry: OrchestratorLogEntry): void {
    this.entries.push(entry);
    super.log(entry);
  }
}

const logger = new CapturingLogger();
const llmClient = createLLMClient({ apiKey });
const orchestrator = new Orchestrator({ llmClient, sandboxRoot, skillDir, logger });

// ── Helpers ───────────────────────────────────────────────────────────────────

let passed = 0;
let failed = 0;

function assert(condition: boolean, message: string): void {
  if (condition) {
    console.log(`  ✓ ${message}`);
    passed++;
  } else {
    console.error(`  ✗ ${message}`);
    failed++;
  }
}

async function waitForStatus(
  taskId: string,
  target: string[],
  timeoutMs = 60_000
): Promise<string> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const s = orchestrator.getTaskStatus(taskId);
    if (s && target.includes(s.status)) return s.status;
    await sleep(1000);
  }
  throw new Error(`Timeout waiting for status ${target.join("|")} on task ${taskId}`);
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

// ── Test 1: Flujo completo filesystem write + read ────────────────────────────

console.log("\n=== Test 1: flujo completo write + read ===");
{
  const taskId = orchestrator.submitTask(
    "Crea un archivo llamado e2e.txt con el texto 'E2E OK' y luego léelo para confirmar."
  );
  const status = await waitForStatus(taskId, ["completed", "failed"]);
  assert(status === "completed", "tarea completada");

  const result = orchestrator.getTaskResult(taskId);
  assert(result !== null, "resultado disponible");
  assert(result?.summary.includes("E2E OK") ?? false, "summary menciona el contenido del archivo");
}

// ── Test 2: Logs incluyen task_id y trace_id ──────────────────────────────────

console.log("\n=== Test 2: logs incluyen task_id y trace_id ===");
{
  const entriesWithBoth = logger.entries.filter(
    (e) => e.taskId && e.taskId !== "system" && e.traceId && e.traceId !== "system"
  );
  assert(entriesWithBoth.length > 0, "hay entradas de log con task_id y trace_id");
  assert(
    entriesWithBoth.every((e) => typeof e.taskId === "string" && typeof e.traceId === "string"),
    "todos los logs tienen task_id y trace_id como strings"
  );
  assert(
    entriesWithBoth.some((e) => e.status === "running"),
    "hay log de transición a running"
  );
  assert(
    entriesWithBoth.some((e) => e.status === "completed"),
    "hay log de transición a completed"
  );
}

// ── Test 3: Sandbox rechaza paths fuera ───────────────────────────────────────

console.log("\n=== Test 3: sandbox rechaza paths fuera ===");
{
  const taskId = orchestrator.submitTask("Lee el archivo /etc/passwd");
  const status = await waitForStatus(taskId, ["completed", "failed"]);
  // La tarea puede completarse pero el resumen debe indicar que no pudo acceder
  const result = orchestrator.getTaskResult(taskId);
  const summary = result?.summary ?? "";
  assert(
    status === "completed" || status === "failed",
    "tarea termina (no queda colgada)"
  );
  assert(
    summary.toLowerCase().includes("sandbox") ||
    summary.toLowerCase().includes("fuera") ||
    summary.toLowerCase().includes("acceder") ||
    summary.toLowerCase().includes("outside") ||
    summary.toLowerCase().includes("no puedo"),
    "summary indica que el acceso fue denegado"
  );
}

// ── Test 4: Goal ambiguo → blocked → resume ───────────────────────────────────

console.log("\n=== Test 4: goal ambiguo → blocked → resume ===");
{
  const taskId = orchestrator.submitTask("Ayúdame con una cosa importante");
  const status1 = await waitForStatus(taskId, ["blocked", "completed", "failed"]);
  assert(status1 === "blocked", "goal ambiguo desencadena blocked");

  const taskStatus = orchestrator.getTaskStatus(taskId);
  assert(
    typeof taskStatus?.blockedReason === "string" && taskStatus.blockedReason.length > 0,
    "blockedReason contiene una pregunta"
  );

  // Resume con input concreto
  orchestrator.resumeTask(taskId, "Quiero crear un archivo llamado resume-test.txt con el texto Listo");
  const status2 = await waitForStatus(taskId, ["completed", "failed"]);
  assert(status2 === "completed", "tarea completa tras resume");
}

// ── Resultado final ───────────────────────────────────────────────────────────

console.log(`\n${"─".repeat(40)}`);
console.log(`Resultado: ${passed} passed, ${failed} failed`);

if (failed > 0) {
  process.exit(1);
}
