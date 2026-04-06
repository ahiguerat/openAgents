import { StateGraph, START, END, Annotation } from "@langchain/langgraph";
import { z } from "zod";
import { buildPlannerSystemPrompt } from "./prompts.js";
import { streamStructuredPlan } from "@openagents/shared/llm";
import { safeJsonParse, deepNullToUndefined } from "@openagents/shared/utils";
import type { CtiPlan } from "./cti-schema.js";
import axios from "axios";

const AgentState = Annotation.Root({
  userPrompt: Annotation<string>,
  dataProvider: Annotation<string>,
  rawModelOutput: Annotation<string>,
  parsedPlan: Annotation<CtiPlan | null>,
  finalUrl: Annotation<string | null>,
  toolResults: Annotation<any[]>,
  apiResponse: Annotation<any | null>,
  reasoningTokens: Annotation<number | null>,
  error: Annotation<string | null>,
});

const nullToUndefined = <T extends z.ZodTypeAny>(schema: T) =>
  z.preprocess((value) => (value === null ? undefined : value), schema);

const CtiPlanSchema = z.object({
  measurement: z.enum([
    "voltage",
    "current",
    "active_power",
    "reactive_power",
    "active_energy",
    "reactive_energy",
    "temperature",
    "pressure",
    "level",
    "tap_position",
    "maneuvers",
    "meter_event",
  ]),
  fieldFilter: nullToUndefined(z.array(z.string()).optional()),
  tagFilter: z.object({
    sensorType: z.string().refine(
      (val) => /^(DC|TR|TSC|LBT\d+|WE\d+)$/.test(val),
      "sensorType debe ser DC, TR, TSC, LBT# o WE# (ej: LBT1, WE0)"
    ),
    meterId: nullToUndefined(z.string().optional()),
    cimId: nullToUndefined(z.string().optional()),
    dcId: nullToUndefined(z.string().optional()),
  }), // Ahora es obligatorio, no optional
  start: nullToUndefined(z.string().optional()),
  end: nullToUndefined(z.string().optional()),
  interval: nullToUndefined(
    z.string()
      .regex(/^\d+$/, "interval debe ser un número string sin unidad")
      .refine((val) => {
        const num = parseInt(val);
        return num >= 1 && num <= 1440;
      }, "interval debe estar entre 1 y 1440")
      .optional()
  ),
  sampling: nullToUndefined(
    z.enum(["min", "max", "mean", "last"]).optional()
  ),
  limit: nullToUndefined(z.number().optional()),
  offset: nullToUndefined(z.number().optional()),
  rationale: nullToUndefined(z.string().optional()).default(""),
});

function buildCtiUrl(plan: CtiPlan): string {
  const base = process.env.CTI_API_BASE_URL;
  if (!base) {
    throw new Error("Falta CTI_API_BASE_URL en variables de entorno");
  }

  const path = `/api/v2/data/measurements/${plan.measurement}`;
  
  // Construir query string manualmente sin encoding adicional
  const params: string[] = [];

  if (plan.fieldFilter?.length) {
    params.push(`fieldFilter=${plan.fieldFilter.join(",")}`);
  }

  // Los parámetros de tagFilter se envían directamente (NO como tagFilter[key])
  if (plan.tagFilter) {
    Object.entries(plan.tagFilter).forEach(([key, value]) => {
      if (value !== undefined && value !== null) {
        params.push(`${key}=${value}`);
      }
    });
  }

  // Forzar fechas amplias por defecto (la API solo tiene datos históricos)
  const start = plan.start || "2024-01-01T00:00:00Z";
  const end = plan.end || "2026-12-31T23:59:59Z";
  params.push(`start=${start}`);
  params.push(`end=${end}`);
  
  if (plan.interval) params.push(`interval=${plan.interval}`);
  if (plan.sampling) params.push(`sampling=${plan.sampling}`);
  if (typeof plan.limit === "number") params.push(`limit=${plan.limit}`);
  if (typeof plan.offset === "number") params.push(`offset=${plan.offset}`);

  const queryString = params.length > 0 ? `?${params.join('&')}` : '';
  return `${base}${path}${queryString}`;
}

const plannerNode = async (state: typeof AgentState.State) => {
  try {
    console.error("\n[DATA_AGENT][PLANNER] Analyzing query...");
    
    const systemPrompt = buildPlannerSystemPrompt();
    const { rawText, reasoningTokens } = await streamStructuredPlan({
      systemPrompt,
      userPrompt: state.userPrompt,
    });

    console.error("[DATA_AGENT][PLANNER] Raw LLM output:", rawText.substring(0, 200));
    const parsed = safeJsonParse(rawText);
    const normalized = deepNullToUndefined(parsed);
    const validated = CtiPlanSchema.parse(normalized) as CtiPlan;
    const finalUrl = buildCtiUrl(validated);
    
    console.error("[DATA_AGENT][PLANNER] Plan ready");

    return {
      rawModelOutput: rawText,
      parsedPlan: validated,
      finalUrl,
      toolResults: [],
      apiResponse: null,
      reasoningTokens: reasoningTokens ?? null,
      error: null,
    };
  } catch (error) {
    console.error("[DATA_AGENT][API] Error:", error instanceof Error ? error.message : error);
    
    return {
      rawModelOutput: "",
      parsedPlan: null,
      finalUrl: null,
      toolResults: [],
      apiResponse: null,
      reasoningTokens: null,
      error: error instanceof Error ? error.message : "Error desconocido",
    };
  }
};

const fetcherNode = async (state: typeof AgentState.State) => {
  if (!state.finalUrl) {
    return {
      toolResults: [],
      apiResponse: null,
    };
  }

  try {
    console.log("[DATA_AGENT][API] Fetching data...");
    
    let urlToFetch = state.finalUrl;
    let isRetry = false;

    // Primer intento con la URL original
    const startTime = Date.now();
    console.error(`[DATA_AGENT][API] Fetching: ${urlToFetch}`);
    
    let response = await axios.get(urlToFetch, {
      headers: {
        "Accept": "application/json",
      },
      proxy: false, // No usar proxy
      timeout: 30000,
    });

    // Si es 404/400, podría ser problema con otros parámetros, intentar con configuración mínima
    if ((response.status === 404 || response.status === 400) && state.parsedPlan) {
      console.error("[DATA_AGENT][API] Got error, retrying with minimal configuration...");
      
      // Construir URL mínima con solo measurement y tagFilter (requerido)
      const base = process.env.CTI_API_BASE_URL;
      const path = `/api/v2/data/measurements/${state.parsedPlan.measurement}`;
      const params: string[] = [];
      
      // tagFilter es obligatorio - parámetros planos
      if (state.parsedPlan.tagFilter) {
        Object.entries(state.parsedPlan.tagFilter).forEach(([key, value]) => {
          if (value !== undefined && value !== null) {
            params.push(`${key}=${value}`);
          }
        });
      }
      
      // Fechas por defecto
      params.push("start=2024-01-01T00:00:00Z");
      params.push("end=2026-12-31T23:59:59Z");
      
      const queryString = params.length > 0 ? `?${params.join('&')}` : '';
      urlToFetch = `${base}${path}${queryString}`;
      
      console.error("[DATA_AGENT][API] Retry URL:", urlToFetch);
      
      response = await axios.get(urlToFetch, {
        headers: {
          "Accept": "application/json",
        },
        proxy: false,
        timeout: 30000,
      });
      
      isRetry = true;
    }

    const duration = Date.now() - startTime;
    const contentType = response.headers["content-type"];

    if (response.status !== 200) {
      console.error(`[DATA_AGENT][API] HTTP ${response.status}: ${response.statusText}`);
      
      return {
        toolResults: [{
          success: false,
          error: `HTTP ${response.status}: ${response.statusText}`,
          details: typeof response.data === 'string' ? response.data : JSON.stringify(response.data),
        }],
        apiResponse: null,
      };
    }

    // Con axios, response.data ya está parseado
    let data = response.data;
    
    // Si es string (CSV u otro), procesar manualmente
    if (typeof data === 'string') {
      if (contentType?.includes("text/csv")) {
        console.error("[DATA_AGENT][API] CSV detected, converting...");
        const lines = data.trim().split("\n");
        if (lines.length > 1) {
          const headers = lines[0].split(",");
          data = lines.slice(1).map((line: string) => {
            const values = line.split(",");
            const obj: any = {};
            headers.forEach((header: string, i: number) => {
              obj[header.trim()] = values[i]?.trim();
            });
            return obj;
          });
        } else {
          data = [];
        }
      } else {
        // Intentar parsear como JSON
        try {
          data = JSON.parse(data);
        } catch {
          data = [];
        }
      }
    }

    // Asegurar que apiResponse sea siempre un array
    const apiResponse = Array.isArray(data) ? data : [];
    const count = apiResponse.length;
    
    if (isRetry) {
      console.log(`[DATA_AGENT][API] Retry successful: ${count} record(s) received (${duration}ms)`);
    } else {
      console.log(`[DATA_AGENT][API] ${count} record(s) received (${duration}ms)`);
    }

    return {
      toolResults: [{
        success: true,
        data: apiResponse,
        status: response.status,
        headers: response.headers,
      }],
      apiResponse: apiResponse,
    };
  } catch (error: any) {
    console.error("[DATA_AGENT][API] Error:", error.message || error);
    
    // Axios wraps errors differently
    if (error.response) {
      // Mostrar el detalle del error de la API
      const errorDetails = typeof error.response.data === 'string' 
        ? error.response.data 
        : JSON.stringify(error.response.data);
      
      console.error(`[DATA_AGENT][API] Response status: ${error.response.status}`);
      console.error(`[DATA_AGENT][API] Response data: ${errorDetails}`);
      
      return {
        toolResults: [{
          success: false,
          error: `HTTP ${error.response.status}: ${error.response.statusText || 'Error'}`,
          details: errorDetails,
        }],
        apiResponse: null,
      };
    }
    
    return {
      toolResults: [{
        success: false,
        error: error.message || String(error),
      }],
      apiResponse: null,
    };
  }
};

export function buildGraph() {
  return new StateGraph(AgentState)
    .addNode("planner", plannerNode)
    .addNode("fetcher", fetcherNode)
    .addEdge(START, "planner")
    .addEdge("planner", "fetcher")
    .addEdge("fetcher", END)
    .compile();
}

