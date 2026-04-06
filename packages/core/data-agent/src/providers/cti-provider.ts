/**
 * CTI (Ormazabal) Data Provider
 * 
 * Implementación específica para obtener datos de la API CTI de Ormazabal
 */

import {
  IDataProvider,
  DataProviderConfig,
  DataProviderResponse,
} from "./index.js";

/**
 * Provider para la API CTI de Ormazabal
 */
export class CtiProvider implements IDataProvider {
  private baseUrl: string;
  private defaultHeaders: Record<string, string>;

  constructor(config?: DataProviderConfig) {
    this.baseUrl = config?.baseUrl || process.env.CTI_BASE_URL || "https://api.cti.ormazabal.com";
    this.defaultHeaders = {
      "Content-Type": "application/json",
      ...config?.headers,
    };
  }

  getName(): string {
    return "cti";
  }

  getBaseUrl(): string {
    return this.baseUrl;
  }

  validateParams(params: any): boolean {
    // Validación básica: debe tener una URL
    if (!params || !params.url) {
      return false;
    }

    // Si es una URL relativa, debe empezar con /
    if (!params.url.startsWith("http") && !params.url.startsWith("/")) {
      return false;
    }

    return true;
  }

  async fetchData(
    url: string,
    method: string = "GET",
    config?: DataProviderConfig
  ): Promise<DataProviderResponse> {
    try {
      console.log("\n" + "=".repeat(80));
      console.log(" [CTI PROVIDER] Iniciando petición HTTP");
      console.log("=".repeat(80));
      console.log(` URL: ${url}`);
      console.log(` Método: ${method}`);
      console.log(` Timestamp: ${new Date().toISOString()}`);

      // Construir URL completa si es relativa
      const fullUrl = url.startsWith("http") ? url : `${this.baseUrl}${url}`;
      
      // Parse URL para mostrar detalles
      const urlObj = new URL(fullUrl);
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

      // Combinar headers
      const headers = {
        ...this.defaultHeaders,
        ...config?.headers,
      };

      const response = await fetch(fullUrl, {
        method,
        headers,
        signal: config?.timeout
          ? AbortSignal.timeout(config.timeout)
          : undefined,
      });

      const duration = Date.now() - startTime;
      console.log(`Tiempo de respuesta: ${duration}ms`);

      if (!response.ok) {
        console.log("\n" + "X".repeat(40));
        console.log(` [CTI ERROR] HTTP ${response.status}: ${response.statusText}`);
        const errorText = await response.text();
        console.log(` Response body:`);
        console.log(errorText);
        console.log("X".repeat(40) + "\n");

        return {
          success: false,
          error: `HTTP ${response.status}: ${response.statusText}`,
          details: errorText,
          status: response.status,
        };
      }

      const data = await response.json();
      const dataSize = JSON.stringify(data).length;

      console.log("\n" + "V".repeat(40));
      console.log(` [CTI SUCCESS] Petición exitosa!`);
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
      console.log(` [CTI EXCEPTION] Error capturado en CtiProvider`);
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
  }
}
