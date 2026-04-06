import { tool } from "@langchain/core/tools";
import { z } from "zod";
import { DataProviderFactory } from "./providers/index.js";

/**
 * Tool para ejecutar consultas a proveedores de datos
 */
export const fetchCtiDataTool = tool(
  async ({ 
    url, 
    method = "GET",
    dataProvider = "cti"
  }: { 
    url: string; 
    method?: string;
    dataProvider?: string;
  }) => {
    try {
      console.log(`\n[fetchCtiDataTool] Usando data provider: ${dataProvider}`);
      
      // Obtener el provider apropiado
      const provider = await DataProviderFactory.getProvider(dataProvider);
      
      console.log(`[fetchCtiDataTool] Provider seleccionado: ${provider.getName()}`);
      console.log(`[fetchCtiDataTool] Base URL: ${provider.getBaseUrl()}`);
      
      // Validar parámetros
      if (!provider.validateParams({ url, method })) {
        return {
          success: false,
          error: `Parámetros inválidos para el provider '${dataProvider}'`,
        };
      }

      // Ejecutar la consulta usando el provider
      const result = await provider.fetchData(url, method);
      
      return result;
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : "Error desconocido";
      
      console.log("\n" + "X".repeat(40));
      console.log(` [EXCEPTION] Error capturado en fetchCtiDataTool`);
      console.log(` Mensaje: ${errorMsg}`);
      console.log("X".repeat(40) + "\n");

      return {
        success: false,
        error: errorMsg,
      };
    }
  },
  {
    name: "fetch_cti_data",
    description:
      "Ejecuta una consulta a un proveedor de datos. Por defecto usa CTI API. Usa esta tool cuando tengas una URL y quieras obtener datos de mediciones.",
    schema: z.object({
      url: z.string().describe("URL completa o path relativo del endpoint a consultar"),
      method: z
        .string()
        .optional()
        .default("GET")
        .describe("Método HTTP (GET, POST, etc)"),
      dataProvider: z
        .string()
        .optional()
        .default("cti")
        .describe("Proveedor de datos a usar (cti, postgres, mongodb, etc). Por defecto: cti"),
    }),
  }
);

export const ctiTools = [fetchCtiDataTool];
