/**
 * Test de integración manual: LLM Client + Tool Gateway + Agent Runtime
 * Uso: bun --env-file=.env platform/runtime/src/test-integration.ts
 */
import path from "node:path";
import { rm } from "node:fs/promises";
import { createLLMClient } from "@openagents/llm-client";
import { ToolRegistry, FilesystemReadAdapter, FilesystemWriteAdapter } from "@openagents/tool-gateway";
import { AgentRuntime } from "./agent-runtime";

const apiKey = process.env.OPENROUTER_API_KEY;
if (!apiKey) {
  console.error("Error: OPENROUTER_API_KEY no está definida.");
  process.exit(1);
}

const sandboxRoot = path.resolve("tmp/integration-sandbox");
const skillDir = path.resolve("skills/general-assistant");

// Limpiar sandbox previo
await rm(sandboxRoot, { recursive: true, force: true });

// Montar componentes
const llmClient = createLLMClient({ apiKey });
const toolRegistry = new ToolRegistry();
toolRegistry.register(new FilesystemReadAdapter(sandboxRoot));
toolRegistry.register(new FilesystemWriteAdapter(sandboxRoot));
const runtime = new AgentRuntime({ llmClient, toolRegistry, defaultSkillDir: skillDir });

// ── Test 1: escribir y leer ───────────────────────────────────────────────────
console.log("=== Test 1: escribir y leer un archivo ===\n");

const result1 = await runtime.run({
  taskId: "integration-1",
  traceId: "trace-1",
  goal: "Crea un archivo llamado notas.txt con el contenido 'Este es un test de integración.' y luego léelo para confirmar que se escribió correctamente.",
});

console.log("Status:", result1.status);
console.log("Summary:", result1.summary);
console.log();

// ── Test 2: tarea sin tools ───────────────────────────────────────────────────
console.log("=== Test 2: respuesta directa sin tools ===\n");

const result2 = await runtime.run({
  taskId: "integration-2",
  traceId: "trace-2",
  goal: "¿Cuántos bloques de desarrollo tiene el MVP de openAgents? Responde en una sola frase.",
});

console.log("Status:", result2.status);
console.log("Summary:", result2.summary);
console.log();

// ── Test 3: path fuera del sandbox ───────────────────────────────────────────
console.log("=== Test 3: intento de acceso fuera del sandbox ===\n");

const result3 = await runtime.run({
  taskId: "integration-3",
  traceId: "trace-3",
  goal: "Lee el archivo /etc/passwd",
});

console.log("Status:", result3.status);
console.log("Summary:", result3.summary);
