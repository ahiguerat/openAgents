import "dotenv/config";
import { performance } from "node:perf_hooks";
import { buildGraph } from "./graph.js";
import { LLMFactory } from "./llm-flexible.js";

async function main() {
  const t0 = performance.now();
  const userPrompt = process.env.USER_PROMPT;

  if (!userPrompt) {
    console.error("ERROR: USER_PROMPT no está configurado en las variables de entorno");
    process.exit(1);
  }

  console.log("═══════════════════════════════════════════");
  console.log("         ORCHESTRATOR AGENT v0.1.0");
  console.log("═══════════════════════════════════════════");
  console.log(`\nUser request: "${userPrompt}"\n`);

  try {
    // Construir y ejecutar el graph
    const graph = buildGraph();
    const result = await graph.invoke({
      userPrompt,
      plan: null,
      dataAgentResponse: null,
      finalMessage: "",
      error: null,
    });

    // Mostrar resultado
    console.log("\n═══════════════════════════════════════════");
    console.log("               RESULTADO");
    console.log("═══════════════════════════════════════════\n");
    console.log(result.finalMessage);
    console.log("\n═══════════════════════════════════════════");

    const totalTime = (performance.now() - t0).toFixed(0);
    console.log(`\nTotal time: ${totalTime}ms\n`);

    // Cleanup
    await LLMFactory.dispose();

  } catch (error) {
    console.error("\n═══════════════════════════════════════════");
    console.error("               ERROR FATAL");
    console.error("═══════════════════════════════════════════\n");
    console.error(error);
    console.error("\n═══════════════════════════════════════════");

    await LLMFactory.dispose();
    process.exit(1);
  }
}

main().catch(async (err) => {
  console.error("[ORCHESTRATOR][FATAL] Unhandled error:", err);
  await LLMFactory.dispose();
  process.exit(1);
});
