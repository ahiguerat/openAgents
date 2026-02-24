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

console.log("Enviando mensaje al LLM...");

try {
  const response = await client.chat([
    { role: "user", content: "Responde solo con: 'LLM Client funcionando correctamente.'" },
  ]);

  console.log("Respuesta:", response);
} catch (err) {
  if (err instanceof LLMError) {
    console.error(`LLMError [${err.code}]:`, err.message);
  } else {
    console.error("Error inesperado:", err);
  }
  process.exit(1);
}
