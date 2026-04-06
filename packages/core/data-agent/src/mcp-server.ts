import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { buildGraph } from "./graph.js";
import "dotenv/config";

const server = new Server(
  {
    name: "cti-data-agent",
    version: "0.1.0",
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: "query_cti_measurements",
        description:
          "Consulta datos de mediciones eléctricas usando un data provider. Por defecto usa CTI API. Soporta consultas sobre voltaje, corriente, potencia, energía, temperatura, presión, nivel de aceite, posición de tap, maniobras y eventos de contadores. Puede filtrar por tipo de sensor (DC, LBT, TR, TSC), meterId, cimId, dcId, y rangos de tiempo.",
        inputSchema: {
          type: "object",
          properties: {
            query: {
              type: "string",
              description:
                "Consulta en lenguaje natural. Ejemplos: 'Dame el voltaje del contador DC 123 en las últimas 24 horas', 'Potencia activa del transformador en intervalos de 15 minutos', 'Temperatura del transformador TR en las últimas 12 horas'",
            },
            dataProvider: {
              type: "string",
              description:
                "Proveedor de datos a usar. Opciones: 'cti' (default), 'postgres', 'mongodb', etc.",
            },
          },
          required: ["query"],
        },
      },
      {
        name: "list_measurement_types",
        description:
          "Lista todos los tipos de mediciones disponibles en la API CTI con sus descripciones y campos disponibles",
        inputSchema: {
          type: "object",
          properties: {},
        },
      },
      {
        name: "list_sensor_types",
        description:
          "Lista los tipos de sensores disponibles (DC, LBT, TR, TSC) con sus descripciones",
        inputSchema: {
          type: "object",
          properties: {},
        },
      },
    ],
  };
});

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    switch (name) {
      case "query_cti_measurements": {
        const query = (args as any)?.query as string;
        const dataProvider = (args as any)?.dataProvider as string | undefined;

        if (!query) {
          throw new Error("El parámetro 'query' es requerido");
        }

        console.error("[DATA_AGENT][MCP] Query: %s", query);
        console.error("[DATA_AGENT][MCP] Provider: %s", dataProvider || 'cti (default)');

        const graph = buildGraph();
        const result = await graph.invoke({
          userPrompt: query,
          dataProvider: dataProvider || 'cti',
          rawModelOutput: "",
          parsedPlan: null,
          finalUrl: null,
          toolResults: [],
          apiResponse: null,
          reasoningTokens: null,
          error: null,
        });

        if (result.error) {
          return {
            content: [
              {
                type: "text",
                text: ` Error al procesar la consulta:\n${result.error}`,
              },
            ],
            isError: true,
          };
        }

        const response = {
          url: result.finalUrl,
          plan: result.parsedPlan,
          apiResponse: result.apiResponse,
          toolResults: result.toolResults,
        };

        console.error("[DATA_AGENT][MCP] Success");

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(response, null, 2),
            },
          ],
        };
      }

      case "list_measurement_types": {
        const measurements = {
          voltage: {
            description: "Tensión eléctrica por fase (V)",
            fields: ["V_A", "V_B", "V_C", "V_AVG"],
          },
          current: {
            description: "Corriente eléctrica por fase (A)",
            fields: ["I_A", "I_B", "I_C", "I_ABC", "I_N"],
          },
          active_power: {
            description: "Potencia activa importada/exportada (W)",
            fields: [
              "Pimp_A",
              "Pimp_B",
              "Pimp_C",
              "Pimp_ABC",
              "Pexp_A",
              "Pexp_B",
              "Pexp_C",
              "Pexp_ABC",
            ],
          },
          reactive_power: {
            description: "Potencia reactiva importada/exportada (var)",
            fields: [
              "Qimp_A",
              "Qimp_B",
              "Qimp_C",
              "Qimp_ABC",
              "Qexp_A",
              "Qexp_B",
              "Qexp_C",
              "Qexp_ABC",
            ],
          },
          active_energy: {
            description: "Energía activa acumulada (Wh/kWh)",
            fields: [
              "AI_A",
              "AI_B",
              "AI_C",
              "AI",
              "AE_A",
              "AE_B",
              "AE_C",
              "AE",
            ],
          },
          reactive_energy: {
            description: "Energía reactiva por cuadrantes (kvarh)",
            fields: [
              "R1_A",
              "R1_B",
              "R1_C",
              "R1",
              "R2_A",
              "R2_B",
              "R2_C",
              "R2",
              "R3_A",
              "R3_B",
              "R3_C",
              "R3",
              "R4_A",
              "R4_B",
              "R4_C",
              "R4",
            ],
          },
          temperature: {
            description: "Temperatura interna del transformador",
            fields: ["T_A", "T_C"],
          },
          pressure: {
            description: "Presión del aceite del transformador",
            fields: ["P_O"],
          },
          level: {
            description: "Nivel de aceite del transformador",
            fields: ["L_O"],
          },
          tap_position: {
            description: "Posición del conmutador bajo carga (OLTC)",
            fields: ["TAP_T"],
          },
          maneuvers: {
            description: "Número acumulado de maniobras/conmutaciones",
            fields: ["M_T"],
          },
          meter_event: {
            description: "Eventos/alarmas reportados por el contador",
            fields: ["D1", "D2"],
          },
        };

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(measurements, null, 2),
            },
          ],
        };
      }

      case "list_sensor_types": {
        const sensorTypes = {
          DC: {
            description: "Contadores domésticos",
            usage: "Para consultas de consumo en viviendas",
          },
          LBT: {
            description: "Líneas de baja tensión (LBT1, LBT2, etc.)",
            usage: "Para monitorización de líneas de distribución",
          },
          TR: {
            description: "Transformador específico (CIM)",
            usage: "Para datos de transformadores individuales",
          },
          TSC: {
            description: "Subestación completa",
            usage: "Para agregación de datos a nivel de subestación",
          },
        };

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(sensorTypes, null, 2),
            },
          ],
        };
      }

      default:
        throw new Error(`Tool desconocida: ${name}`);
    }
  } catch (error) {
    const errorMsg =
      error instanceof Error ? error.message : "Error desconocido";
    console.error("[DATA_AGENT][MCP] Error: %s", errorMsg);

    return {
      content: [
        {
          type: "text",
          text: `Error al ejecutar la tool: ${errorMsg}`,
        },
      ],
      isError: true,
    };
  }
});

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("[DATA_AGENT][MCP] Server ready");
}

main().catch((error) => {
  console.error("[DATA_AGENT][MCP] Fatal:", error);
  process.exit(1);
});


