import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { buildGraph } from "./graph.js";
import { LLMFactory } from "./llm-flexible.js";
import "dotenv/config";

const server = new Server(
  {
    name: "orchestrator-agent",
    version: "0.1.0",
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

/**
 * Listar tools disponibles
 */
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: "process_user_request",
        description:
          "Procesa una solicitud del usuario analizándola, coordinando con agentes especializados (data-agent, viz-agent) y retornando el resultado. El orchestrator usa LLM para entender la solicitud, decide qué agentes invocar, y combina los resultados.",
        inputSchema: {
          type: "object",
          properties: {
            prompt: {
              type: "string",
              description:
                "Solicitud del usuario en lenguaje natural. Ejemplos: 'Dame una gráfica de la temperatura del transformador TR de los últimos 30 días', 'Muéstrame el voltaje del DC123', 'Dame los datos de corriente del último mes'",
            },
          },
          required: ["prompt"],
        },
      },
    ],
  };
});

/**
 * Manejar llamadas a tools
 */
server.setRequestHandler(CallToolRequestSchema, async (request: any) => {
  const { name, arguments: args } = request.params;

  if (name === "process_user_request") {
    const userPrompt = args?.prompt as string;

    if (!userPrompt) {
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              error: "prompt is required",
            }),
          },
        ],
      };
    }

    try {
      console.error("[ORCHESTRATOR][MCP-SERVER] Received request: process_user_request");
      console.error(`[ORCHESTRATOR][MCP-SERVER] User prompt: ${userPrompt}`);

      // Construir y ejecutar el graph
      const graph = buildGraph();
      const result = await graph.invoke({
        userPrompt,
        plan: null,
        dataAgentResponse: null,
        finalMessage: "",
        error: null,
        mcpClient: null,
      });

      // Cerrar MCP client si está abierto
      if (result.mcpClient) {
        try {
          await result.mcpClient.disconnect();
        } catch (e) {
          console.error(`[ORCHESTRATOR][MCP-SERVER] Error disconnecting MCP client: ${e}`);
        }
      }

      // Cleanup LLM
      await LLMFactory.dispose();

      console.error("[ORCHESTRATOR][MCP-SERVER] Request completed");

      // Retornar resultado
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              success: !result.error,
              message: result.finalMessage,
              plan: result.plan,
              dataRecordCount: result.dataAgentResponse?.data?.length || 0,
              visualization: result.vizAgentResponse?.success ? {
                imagePath: result.vizAgentResponse.imagePath,
                chartType: result.vizAgentResponse.plan?.chartType,
                rationale: result.vizAgentResponse.plan?.rationale,
              } : null,
              error: result.error,
            }, null, 2),
          },
        ],
      };
    } catch (error) {
      console.error(`[ORCHESTRATOR][MCP-SERVER] Fatal error: ${error instanceof Error ? error.message : error}`);
      
      // Cleanup
      await LLMFactory.dispose();

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              error: error instanceof Error ? error.message : "Unknown error",
            }),
          },
        ],
      };
    }
  }

  return {
    content: [
      {
        type: "text",
        text: JSON.stringify({ error: `Unknown tool: ${name}` }),
      },
    ],
  };
});

/**
 * Main
 */
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("[ORCHESTRATOR][MCP] Server ready");
}

main().catch((error) => {
  console.error("[ORCHESTRATOR][MCP] Fatal:", error);
  process.exit(1);
});
