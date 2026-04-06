import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import * as readline from "readline";

async function main() {
  // Conectar al orchestrator
  const transport = new StdioClientTransport({
    command: "node",
    args: ["./dist/mcp-server.js"],
    env: process.env as Record<string, string>,
  });

  const client = new Client(
    { name: "interactive", version: "1.0.0" },
    { capabilities: {} }
  );

  console.error("[ORCHESTRATOR][INTERACTIVE] Connecting to orchestrator MCP server");
  await client.connect(transport);
  console.error("[ORCHESTRATOR][INTERACTIVE] Connected successfully\n");

  // Listar tools
  const tools = await client.listTools();
  console.error(`[ORCHESTRATOR][INTERACTIVE] Available tools: ${tools.tools.map((t: any) => t.name).join(", ")}`);
  console.error("[ORCHESTRATOR][INTERACTIVE] Interactive mode ready");
  console.error("[ORCHESTRATOR][INTERACTIVE] Type your prompt and press Enter");
  console.error("[ORCHESTRATOR][INTERACTIVE] Type 'exit' to quit\n");

  // REPL interactivo
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: "> ",
  });

  rl.prompt();

  rl.on("line", async (line) => {
    const trimmed = line.trim();

    if (trimmed === "exit") {
      console.error("[ORCHESTRATOR][INTERACTIVE] Closing connection");
      await client.close();
      rl.close();
      process.exit(0);
    }

    if (!trimmed) {
      rl.prompt();
      return;
    }

    try {
      console.error(`[ORCHESTRATOR][INTERACTIVE] Processing prompt: ${trimmed}\n`);
      
      const result = await client.callTool({
        name: "process_user_request",
        arguments: { prompt: trimmed },
      });

      if (result.content && Array.isArray(result.content) && result.content.length > 0) {
        const content = result.content[0];
        if (content.type === "text") {
          const data = JSON.parse(content.text);
          
          console.error("[ORCHESTRATOR][INTERACTIVE] Result received\n");
          
          if (data.success) {
            console.log("SUCCESS\n");
            
            // Mostrar información de datos
            if (data.dataRecordCount !== undefined) {
              console.log(`Data records obtained: ${data.dataRecordCount}`);
            }
            
            // Mostrar información de visualización si existe
            if (data.visualization) {
              console.log("\nVISUALIZATION CREATED:");
              console.log(`   Image path: ${data.visualization.imagePath}`);
              if (data.visualization.chartType) {
                console.log(`   Chart type: ${data.visualization.chartType}`);
              }
              if (data.visualization.rationale) {
                console.log(`   Rationale: ${data.visualization.rationale}`);
              }
            }
            
            // Mostrar mensaje si existe
            if (data.message) {
              console.log("\nMESSAGE:");
              console.log(data.message);
            }
          } else {
            console.log("ERROR:", data.error || "Unknown error");
          }
          
          console.log();
        }
      } else {
        console.error("[ORCHESTRATOR][INTERACTIVE] No content in response");
      }
    } catch (error) {
      console.error(`[ORCHESTRATOR][INTERACTIVE] Error: ${error instanceof Error ? error.message : error}`);
    }

    rl.prompt();
  });

  rl.on("close", async () => {
    console.error("\n[ORCHESTRATOR][INTERACTIVE] Shutting down");
    await client.close();
    process.exit(0);
  });
}

main().catch((error) => {
  console.error(`[ORCHESTRATOR][INTERACTIVE] Fatal error: ${error instanceof Error ? error.message : error}`);
  process.exit(1);
});
