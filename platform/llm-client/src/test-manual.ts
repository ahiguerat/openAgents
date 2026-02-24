/**
 * Test manual del LLM Client.
 * Uso: bun platform/llm-client/src/test-manual.ts
 */
import { createLLMClient, LLMError } from "./index";

const apiKey = process.env.OPENROUTER_API_KEY;
if (!apiKey) {
  console.error("Error: OPENROUTER_API_KEY no está definida en el entorno.");
  process.exit(1);
}

const client = createLLMClient({ apiKey });

// ─── Test 1: respuesta de texto simple ───────────────────────────────────────
console.log("Test 1: mensaje simple sin tools...");

try {
  const response = await client.chat({
    system: "Eres un asistente de pruebas. Responde de forma muy breve.",
    messages: [
      { role: "user", content: "Responde solo con: 'LLM Client funcionando correctamente.'" },
    ],
    tools: [],
  });

  console.log("  stopReason:", response.stopReason);
  console.log("  text:", response.text);
  console.log("  toolCalls:", response.toolCalls);
  console.assert(response.stopReason === "end_turn", "stopReason debe ser end_turn");
  console.assert(response.text !== null, "text no debe ser null");
  console.assert(response.toolCalls.length === 0, "no debe haber tool calls");
  console.log("  OK\n");
} catch (err) {
  if (err instanceof LLMError) {
    console.error(`  LLMError [${err.code}]:`, err.message);
  } else {
    console.error("  Error inesperado:", err);
  }
  process.exit(1);
}

// ─── Test 2: respuesta con tool call ─────────────────────────────────────────
console.log("Test 2: mensaje con tool disponible...");

try {
  const response = await client.chat({
    system: "Cuando el usuario pida leer un archivo, usa la tool filesystem_read.",
    messages: [
      { role: "user", content: "Lee el archivo /tmp/test.txt" },
    ],
    tools: [
      {
        name: "filesystem_read",
        description: "Lee el contenido de un archivo",
        input_schema: {
          type: "object",
          properties: {
            path: { type: "string", description: "Ruta del archivo" },
          },
          required: ["path"],
        },
      },
    ],
  });

  console.log("  stopReason:", response.stopReason);
  console.log("  text:", response.text);
  console.log("  toolCalls:", JSON.stringify(response.toolCalls, null, 2));
  console.assert(response.stopReason === "tool_use", "stopReason debe ser tool_use");
  console.assert(response.toolCalls.length > 0, "debe haber al menos un tool call");
  console.assert(response.toolCalls[0].name === "filesystem_read", "tool call debe ser filesystem_read");
  console.log("  OK\n");
} catch (err) {
  if (err instanceof LLMError) {
    console.error(`  LLMError [${err.code}]:`, err.message);
  } else {
    console.error("  Error inesperado:", err);
  }
  process.exit(1);
}

console.log("Todos los tests pasaron.");
