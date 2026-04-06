import "dotenv/config";
import { performance } from "node:perf_hooks";
import { buildGraph } from "./graph.js";
import { exit } from "node:process";
import { LLMFactory } from "./llm-flexible.js";

function prettyPrintUrl(urlString: string) {
  const url = new URL(urlString);
  console.log("\n[DATA_AGENT][URL] %s%s", url.origin, url.pathname);
  
  if (url.searchParams.toString()) {
    console.log("[DATA_AGENT][URL] Params: %s", url.searchParams.toString());
  }
}

async function main() {
  const t0 = performance.now();
  const userPrompt = process.env.USER_PROMPT;

  console.log("[DATA_AGENT][MAIN] Prompt:", userPrompt);

  const graph = buildGraph();
  const result = await graph.invoke({
    userPrompt,
    rawModelOutput: "",
    parsedPlan: null,
    finalUrl: null,
    toolResults: [],
    apiResponse: null,
    reasoningTokens: null,
    error: null,
  });

  if (result.error) {
    console.error("\n[DATA_AGENT][ERROR] Error:", result.error);
    console.log("[DATA_AGENT][MAIN] Time: %dms", (performance.now() - t0).toFixed(0));
    process.exit(1);
  }

  if (result.finalUrl) {
    prettyPrintUrl(result.finalUrl);
  }

  if (result.apiResponse) {
    console.log("\n" + "=".repeat(60));
    console.log("[DATA_AGENT][RESULTS] Data received");
    console.log("=".repeat(60));
    
    const isArray = Array.isArray(result.apiResponse);
    
    if (isArray) {
      const count = result.apiResponse.length;
      console.log("[DATA_AGENT][RESULTS] %d record(s)", count);
      
      if (count > 0) {
        const firstItem = result.apiResponse[0];
        const fields = Object.keys(firstItem);
        console.log("[DATA_AGENT][RESULTS] Fields: %s", fields.join(", "));
        
        // Mostrar primeros 3 registros
        const preview = result.apiResponse.slice(0, 3);
        console.log("\n[DATA_AGENT][RESULTS] Sample data:");
        console.log(JSON.stringify(preview, null, 2));
        
        if (count > 3) {
          console.log("\n[DATA_AGENT][RESULTS] ... and %d more record(s)", count - 3);
        }
      } else {
        console.log("[DATA_AGENT][RESULTS] No data");
      }
    } else {
      console.log("[DATA_AGENT][RESULTS] Response:");
      console.log(JSON.stringify(result.apiResponse, null, 2));
    }
    
    console.log("=".repeat(60));
  }

  console.log("\n[DATA_AGENT][MAIN] Total time: %dms", (performance.now() - t0).toFixed(0));

  // Liberar recursos del LLM provider
  await LLMFactory.dispose();
}

main().catch(async (err) => {
  console.error("[DATA_AGENT][FATAL] Fatal error:", err);
  await LLMFactory.dispose();
  process.exit(1);
});
