import { AppConfig, ConfigSchema } from "./schema.js";

let cachedConfig: AppConfig | null = null;

export class ConfigurationManager {
  private static instance: ConfigurationManager | null = null;
  private config: AppConfig;

  private constructor() {
    this.config = this.loadAndValidate();
  }

  static getInstance(): ConfigurationManager {
    if (!ConfigurationManager.instance) {
      ConfigurationManager.instance = new ConfigurationManager();
    }
    return ConfigurationManager.instance;
  }

  private loadAndValidate(): AppConfig {
    const rawConfig = {
      llm: {
        provider: (process.env.LLM_PROVIDER || "openrouter") as "openrouter" | "copilot",
        openrouter:
          process.env.LLM_PROVIDER !== "copilot"
            ? {
                apiKey: process.env.OPENROUTER_API_KEY || "",
                model: process.env.OPENROUTER_MODEL || "nvidia/llama-3.1-nemotron-70b-instruct",
                baseURL: process.env.OPENROUTER_BASE_URL || "https://openrouter.ai/api/v1",
              }
            : undefined,
        copilot:
          process.env.LLM_PROVIDER === "copilot"
            ? {
                model: process.env.COPILOT_MODEL || "claude-sonnet-4.5",
              }
            : undefined,
      },
      cti: {
        baseURL: process.env.CTI_BASE_URL || process.env.CTI_API_BASE_URL || "https://api.cti.ormazabal.com",
      },
      mcp: {
        dataAgentPath: process.env.DATA_AGENT_MCP_PATH || "../data-agent/dist/mcp-server.js",
        vizAgentPath: process.env.VIZ_AGENT_MCP_PATH || "../visualization-agent/dist/mcp-server.js",
      },
      output: {
        directory: process.env.OUTPUT_DIR || "./output",
      },
      userPrompt: process.env.USER_PROMPT,
    };

    try {
      const validated = ConfigSchema.parse(rawConfig);
      return validated;
    } catch (error: any) {
      console.error("❌ Configuration validation failed:");
      console.error(error.errors || error.message);
      throw new Error("Invalid configuration. Please check your environment variables.");
    }
  }

  getConfig(): AppConfig {
    return this.config;
  }

  getLLMConfig() {
    return this.config.llm;
  }

  getCTIConfig() {
    return this.config.cti;
  }

  getMCPConfig() {
    return this.config.mcp;
  }

  getOutputConfig() {
    return this.config.output;
  }

  getUserPrompt(): string | undefined {
    return this.config.userPrompt;
  }
}

// Helper function para uso directo
export function getConfig(): AppConfig {
  if (!cachedConfig) {
    cachedConfig = ConfigurationManager.getInstance().getConfig();
  }
  return cachedConfig;
}
