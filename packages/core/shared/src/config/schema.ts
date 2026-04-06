import { z } from "zod";

// Schema de configuración con Zod para validación type-safe
export const ConfigSchema = z.object({
  llm: z.object({
    provider: z.enum(["openrouter", "copilot"]).default("openrouter"),
    openrouter: z
      .object({
        apiKey: z.string().min(1, "OpenRouter API key is required"),
        model: z.string().default("nvidia/llama-3.1-nemotron-70b-instruct"),
        baseURL: z.string().url().default("https://openrouter.ai/api/v1"),
      })
      .optional(),
    copilot: z
      .object({
        model: z.string().default("claude-sonnet-4.5"),
      })
      .optional(),
  }),
  
  cti: z.object({
    baseURL: z.string().url().default("https://api.cti.ormazabal.com"),
  }),
  
  mcp: z.object({
    dataAgentPath: z.string().default("../data-agent/dist/mcp-server.js"),
    vizAgentPath: z.string().default("../visualization-agent/dist/mcp-server.js"),
  }),
  
  output: z.object({
    directory: z.string().default("./output"),
  }),
  
  userPrompt: z.string().optional(),
});

export type AppConfig = z.infer<typeof ConfigSchema>;

// Tipos auxiliares
export type LLMProviderType = AppConfig["llm"]["provider"];
export type LLMConfig = AppConfig["llm"];
export type CTIConfig = AppConfig["cti"];
export type MCPConfig = AppConfig["mcp"];
export type OutputConfig = AppConfig["output"];
