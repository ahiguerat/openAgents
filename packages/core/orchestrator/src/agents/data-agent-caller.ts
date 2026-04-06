import { spawn } from "node:child_process";
import { resolve } from "node:path";
import type { DataAgentResponse, AgentExecutionResult } from "../types.js";

/**
 * Interfaz para llamar al data-agent como proceso hijo
 */
export class DataAgentCaller {
  private dataAgentPath: string;
  private timeoutMs: number;

  constructor(dataAgentPath?: string, timeoutMs: number = 120000) {
    // Por defecto, buscar data-agent relativo a este módulo
    this.dataAgentPath = dataAgentPath || 
      resolve(process.cwd(), "../data-agent/dist/index.js");
    this.timeoutMs = timeoutMs;
  }

  /**
   * Ejecuta el data-agent con un prompt específico
   */
  async execute(prompt: string): Promise<AgentExecutionResult> {
    const startTime = Date.now();

    try {
      console.log(`\n[ORCHESTRATOR][DATA-AGENT] Executing with prompt: "${prompt}"`);
      console.log(`[ORCHESTRATOR][DATA-AGENT] Path: ${this.dataAgentPath}`);

      const result = await this.spawnDataAgent(prompt);
      const executionTime = Date.now() - startTime;

      console.log(`[ORCHESTRATOR][DATA-AGENT] Completed in ${executionTime}ms`);

      return {
        agent: "data-agent",
        success: true,
        output: result,
        executionTime,
      };
    } catch (error) {
      const executionTime = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : String(error);

      console.error(`[ORCHESTRATOR][DATA-AGENT] Error: ${errorMessage}`);

      return {
        agent: "data-agent",
        success: false,
        error: errorMessage,
        executionTime,
      };
    }
  }

  /**
   * Spawn del proceso data-agent y captura de output
   */
  private async spawnDataAgent(prompt: string): Promise<DataAgentResponse> {
    return new Promise((resolve, reject) => {
      // Heredar variables de entorno y agregar USER_PROMPT
      const env = {
        ...process.env,
        USER_PROMPT: prompt,
      };

      // Spawn proceso
      const child = spawn("node", [this.dataAgentPath], {
        env,
        stdio: ["ignore", "pipe", "pipe"],
      });

      let stdout = "";
      let stderr = "";

      // Capturar stdout
      child.stdout.on("data", (data) => {
        const text = data.toString();
        stdout += text;
        // Echo output del data-agent (opcional, comentar para silenciar)
        process.stdout.write(`[DATA-AGENT] ${text}`);
      });

      // Capturar stderr
      child.stderr.on("data", (data) => {
        const text = data.toString();
        stderr += text;
        // Echo errors del data-agent
        process.stderr.write(`[DATA-AGENT] ${text}`);
      });

      // Timeout
      const timeout = setTimeout(() => {
        child.kill("SIGTERM");
        reject(new Error(`Data-agent timeout after ${this.timeoutMs}ms`));
      }, this.timeoutMs);

      // Proceso terminado
      child.on("close", (code) => {
        clearTimeout(timeout);

        if (code !== 0) {
          reject(new Error(`Data-agent exited with code ${code}\nStderr: ${stderr}`));
          return;
        }

        // Parsear output
        try {
          const response = this.parseDataAgentOutput(stdout);
          resolve(response);
        } catch (error) {
          reject(new Error(`Failed to parse data-agent output: ${error}\nStdout: ${stdout}`));
        }
      });

      // Error al spawn
      child.on("error", (error) => {
        clearTimeout(timeout);
        reject(new Error(`Failed to spawn data-agent: ${error.message}`));
      });
    });
  }

  /**
   * Parsea el output del data-agent para extraer los datos JSON
   */
  private parseDataAgentOutput(stdout: string): DataAgentResponse {
    // El data-agent imprime varios tipos de salida:
    // 1. Response JSON directo: {"raw": "[]"} o [{"campo": "valor"}]
    // 2. "Sample data:" seguido por JSON
    // 3. Múltiples logs con [DATA_AGENT][XXX]
    
    // Estrategia: buscar el bloque JSON después de "[DATA_AGENT][RESULTS]"
    const lines = stdout.split("\n");
    
    // Buscar el índice donde comienza "[DATA_AGENT][RESULTS] Response:"
    let jsonStartIndex = -1;
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].includes("[DATA_AGENT][RESULTS] Response:")) {
        jsonStartIndex = i + 1; // El JSON empieza en la siguiente línea
        break;
      } else if (lines[i].includes("[DATA_AGENT][RESULTS] Sample data:")) {
        jsonStartIndex = i + 1;
        break;
      }
    }

    if (jsonStartIndex !== -1 && jsonStartIndex < lines.length) {
      // Recolectar líneas hasta el próximo separador o fin
      let jsonLines: string[] = [];
      for (let i = jsonStartIndex; i < lines.length; i++) {
        const line = lines[i];
        
        // Parar si encontramos el separador de "==="
        if (line.includes("===")) break;
        
        // Parar si encontramos otro log [DATA_AGENT]
        if (line.includes("[DATA_AGENT][MAIN]")) break;
        
        jsonLines.push(line);
      }

      const jsonText = jsonLines.join("\n").trim();
      
      if (jsonText) {
        try {
          const data = JSON.parse(jsonText);
          return {
            success: true,
            data,
            metadata: {
              recordCount: Array.isArray(data) ? data.length : 1,
            },
          };
        } catch (e) {
          console.error("[ORCHESTRATOR] Failed to parse JSON from data-agent:", e);
          console.error("[ORCHESTRATOR] JSON text was:", jsonText);
        }
      }
    }

    // Si no encontramos JSON después de [RESULTS], buscar con regex
    const jsonMatch = stdout.match(/\{[\s\S]*?"raw"[\s\S]*?\}|\[[\s\S]*?\]/g);
    if (jsonMatch && jsonMatch.length > 0) {
      // Buscar el JSON que parece más completo (más largo)
      const sortedMatches = jsonMatch.sort((a, b) => b.length - a.length);
      
      for (const match of sortedMatches) {
        try {
          const data = JSON.parse(match);
          return {
            success: true,
            data,
            metadata: {
              recordCount: Array.isArray(data) ? data.length : 1,
            },
          };
        } catch (e) {
          // Intentar siguiente match
          continue;
        }
      }
    }

    // Si llegamos aquí, verificar si hubo error
    if (stdout.includes("[DATA_AGENT][ERROR]") || stdout.includes("Error:")) {
      // Extraer mensaje de error
      const errorMatch = stdout.match(/\[DATA_AGENT\]\[ERROR\] Error: (.+)/);
      if (errorMatch) {
        return {
          success: false,
          error: errorMatch[1],
        };
      }
      return {
        success: false,
        error: "Data-agent reported an error. Check logs above.",
      };
    }

    // No se encontró JSON válido
    console.error("[ORCHESTRATOR] Could not parse data-agent output. Full stdout:");
    console.error(stdout);
    
    return {
      success: false,
      error: "No valid JSON data found in data-agent output",
    };
  }
}
