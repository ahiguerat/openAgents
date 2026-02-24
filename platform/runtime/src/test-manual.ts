/**
 * Test manual del Agent Runtime.
 * Uso: bun --env-file=.env platform/runtime/src/test-manual.ts
 */
import path from "node:path";
import { createLLMClient } from "@openagents/llm-client";
import { ToolRegistry, FilesystemReadAdapter, FilesystemWriteAdapter } from "@openagents/tool-gateway";
import { AgentRuntime } from "./agent-runtime";

const apiKey = process.env.OPENROUTER_API_KEY;
if (!apiKey) {
  console.error("Error: OPENROUTER_API_KEY no está definida.");
  process.exit(1);
}

// Sandbox: directorio temporal dentro del proyecto
const sandboxRoot = path.resolve("tmp/sandbox");
const skillDir = path.resolve("skills/general-assistant");

// Montar componentes
const llmClient = createLLMClient({ apiKey });

const toolRegistry = new ToolRegistry();
toolRegistry.register(new FilesystemReadAdapter(sandboxRoot));
toolRegistry.register(new FilesystemWriteAdapter(sandboxRoot));

const runtime = new AgentRuntime({ llmClient, toolRegistry, defaultSkillDir: skillDir });

// Crear un archivo de prueba en el sandbox antes de ejecutar
import { mkdir, writeFile } from "node:fs/promises";
await mkdir(sandboxRoot, { recursive: true });
await writeFile(path.join(sandboxRoot, "hello.txt"), "Hola desde el sandbox!", "utf8");

console.log("Ejecutando AgentRuntime...\n");

const result = await runtime.run({
  taskId: "test-task-1",
  traceId: "test-trace-1",
  goal: "Lee el archivo hello.txt y dime qué contiene.",
});

console.log("Status:", result.status);
console.log("Summary:", result.summary);
console.log("Artifacts:", result.artifacts);
