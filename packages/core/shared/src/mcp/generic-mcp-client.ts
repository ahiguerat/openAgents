import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

export interface MCPClientConfig {
  name: string;
  version: string;
  serverPath: string;
  defaultTimeout?: number;
  logPrefix?: string;
}

export abstract class GenericMCPClient {
  protected client: Client | null = null;
  protected transport: StdioClientTransport | null = null;
  protected config: MCPClientConfig;

  constructor(config: MCPClientConfig) {
    this.config = {
      defaultTimeout: 300000, // 5 minutes
      logPrefix: config.name.toUpperCase(),
      ...config,
    };
  }

  async connect(): Promise<void> {
    if (this.client) {
      this.log("Already connected");
      return;
    }

    this.log(`Connecting to server at: ${this.config.serverPath}`);

    this.transport = new StdioClientTransport({
      command: "node",
      args: [this.config.serverPath],
      env: process.env as Record<string, string>,
    });

    this.client = new Client(
      {
        name: this.config.name,
        version: this.config.version,
      },
      {
        capabilities: {},
      }
    );

    await this.client.connect(this.transport);
    this.log("Connected successfully");

    const tools = await this.client.listTools();
    this.log(`Available tools: ${tools.tools.map((t: { name: string }) => t.name).join(", ")}`);
  }

  protected async callTool(
    toolName: string,
    args: Record<string, any>,
    timeout?: number
  ): Promise<any> {
    if (!this.client) {
      throw new Error("MCP client not connected. Call connect() first.");
    }

    this.log(`Calling tool: ${toolName}`);
    this.logDebug(`Arguments: ${JSON.stringify(args, null, 2)}`);

    try {
      const timeoutMs = timeout || this.config.defaultTimeout!;
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(
          () => reject(new Error(`Tool call timed out after ${timeoutMs}ms`)),
          timeoutMs
        );
      });

      const callPromise = this.client.callTool({
        name: toolName,
        arguments: args,
      });

      const result = (await Promise.race([
        callPromise,
        timeoutPromise,
      ])) as any;

      this.log("Tool response received");

      if (
        result.content &&
        Array.isArray(result.content) &&
        result.content.length > 0
      ) {
        const content = result.content[0];

        if (content.type === "text") {
          try {
            return JSON.parse(content.text);
          } catch (e) {
            return { raw: content.text };
          }
        }

        return content;
      }

      return null;
    } catch (error) {
      this.logError(
        `Error calling tool ${toolName}: ${error instanceof Error ? error.message : error}`
      );
      throw error;
    }
  }

  async disconnect(): Promise<void> {
    if (this.client) {
      this.log("Disconnecting");
      await this.client.close();
      this.client = null;
      this.transport = null;
      this.log("Disconnected");
    }
  }

  protected log(message: string): void {
    console.error(`[${this.config.logPrefix}] ${message}`);
  }

  protected logDebug(message: string): void {
    console.error(`[${this.config.logPrefix}][DEBUG] ${message}`);
  }

  protected logError(message: string): void {
    console.error(`[${this.config.logPrefix}][ERROR] ${message}`);
  }
}
