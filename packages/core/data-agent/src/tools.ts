import { tool } from "@langchain/core/tools";
import { z } from "zod";
import { ur } from "zod/v4/locales";

/**
 * Tool para ejecutar consultas HTTP a la API CTI
 */
export const fetchCtiDataTool = tool(
  async ({ url, method = "GET" }: { url: string; method?: string }) => {
    try {
      console.log("\n" + "=".repeat(80));
      console.log(" [API REQUEST] Iniciando petición HTTP");
      console.log("=".repeat(80));
      console.log(` URL: ${url}`);
      console.log(` Método: ${method}`);
      console.log(` Timestamp: ${new Date().toISOString()}`);
      
      // Parse URL para mostrar detalles
      const urlObj = new URL(url);
      console.log(`\n Detalles de la URL:`);
      console.log(`   - Base: ${urlObj.origin}`);
      console.log(`   - Path: ${urlObj.pathname}`);
      
      if (urlObj.search) {
        console.log(`\n Query Parameters:`);
        urlObj.searchParams.forEach((value, key) => {
          try {
            const parsed = JSON.parse(value);
            console.log(`   - ${key}:`, JSON.stringify(parsed, null, 6));
          } catch {
            console.log(`   - ${key}: ${value}`);
          }
        });
      }

      console.log("\n Enviando petición...");
      const startTime = Date.now();

      const response = await fetch(url, {
        method,
        headers: {
          "Content-Type": "application/json",
        },
      });

      const duration = Date.now() - startTime;
      console.log(`Tiempo de respuesta: ${duration}ms`);

      if (!response.ok) {
        console.log("\n" + "X".repeat(40));
        console.log(` [API ERROR] HTTP ${response.status}: ${response.statusText}`);
        const errorText = await response.text();
        console.log(` Response body:`);
        console.log(errorText);
        console.log("X".repeat(40) + "\n");
        
        return {
          success: false,
          error: `HTTP ${response.status}: ${response.statusText}`,
          details: errorText,
        };
      }

      const data = await response.json();
      const dataSize = JSON.stringify(data).length;

      console.log("\n" + "V".repeat(40));
      console.log(` [API SUCCESS] Petición exitosa!`);
      console.log(` Status: ${response.status} ${response.statusText}`);
      console.log(` Tamaño de datos: ${dataSize} bytes (${(dataSize / 1024).toFixed(2)} KB)`);
      
      if (Array.isArray(data)) {
        console.log(` Número de registros: ${data.length}`);
        if (data.length > 0) {
          console.log(`\n Muestra del primer registro:`);
          console.log(JSON.stringify(data[0], null, 2));
        }
      } else {
        console.log(`\n Datos recibidos:`);
        console.log(JSON.stringify(data, null, 2));
      }
      
      console.log("\n Response Headers:");
      response.headers.forEach((value, key) => {
        console.log(`   - ${key}: ${value}`);
      });
      
      console.log("V".repeat(40) + "\n");

      return {
        success: true,
        data,
        status: response.status,
        headers: Object.fromEntries(response.headers.entries()),
      };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : "Error desconocido";
      const errorStack = error instanceof Error ? error.stack : "";
      
      console.log("\n" + "X".repeat(40));
      console.log(` [EXCEPTION] Error capturado en fetchCtiDataTool`);
      console.log(` Mensaje: ${errorMsg}`);
      if (errorStack) {
        console.log(`\n Stack trace:`);
        console.log(errorStack);
      }
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
      "Ejecuta una consulta HTTP GET a la API CTI. Usa esta tool cuando tengas una URL completa y quieras obtener los datos de mediciones.",
    schema: z.object({
      url: z.string().describe("URL completa del endpoint CTI a consultar"),
      method: z
        .string()
        .optional()
        .default("GET")
        .describe("Método HTTP (GET, POST, etc)"),
    }),
  }
);

export const ctiTools = [fetchCtiDataTool];
