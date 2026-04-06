#!/usr/bin/env node

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  Tool,
} from '@modelcontextprotocol/sdk/types.js';
import { executeVisualization } from './graph.js';
import { LLMFactory } from './llm-flexible.js';
import { VisualizationRequest, VisualizationResponse, DEFAULT_CHART_CONFIG } from './types.js';

const TOOL_NAME = 'create_visualization';

const visualizationTool: Tool = {
  name: TOOL_NAME,
  description: 'Create data visualizations (charts, tables) based on natural language prompts. The agent analyzes your data and request to determine the best visualization type, generates the chart, and saves it to disk.',
  inputSchema: {
    type: 'object',
    properties: {
      prompt: {
        type: 'string',
        description: 'Natural language description of the desired visualization (e.g., "Show voltage trend over time", "Compare values by sensor")',
      },
      data: {
        type: 'array',
        description: 'Array of data objects to visualize. Each object should have consistent field names.',
        items: {
          type: 'object',
        },
      },
      suggestedType: {
        type: 'string',
        description: 'Optional: Suggest a chart type (line_chart, bar_chart, pie, scatter, table, area_chart, radar, histogram, heatmap)',
        enum: ['line_chart', 'bar_chart', 'pie', 'scatter', 'table', 'area_chart', 'radar', 'histogram', 'heatmap'],
      },
      outputDir: {
        type: 'string',
        description: 'Optional: Directory where to save the chart image (default: ./output)',
      },
    },
    required: ['prompt', 'data'],
  },
};

class VisualizationMCPServer {
  private server: Server;

  constructor() {
    console.error('[VIZ_AGENT][MCP] Initializing MCP Server');
    
    this.server = new Server(
      {
        name: 'visualization-agent',
        version: '2.0.0',
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );

    this.setupHandlers();
    console.error('[VIZ_AGENT][MCP] Server initialized');
  }

  private setupHandlers(): void {
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      console.error('[VIZ_AGENT][MCP] Listing available tools');
      return {
        tools: [visualizationTool],
      };
    });

    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      console.error(`[VIZ_AGENT][MCP] Tool called: ${request.params.name}`);
      
      if (request.params.name !== TOOL_NAME) {
        throw new Error(`Unknown tool: ${request.params.name}`);
      }

      const startTime = Date.now();
      
      try {
        const { prompt, data, suggestedType, outputDir } = request.params.arguments as {
          prompt: string;
          data: any[];
          suggestedType?: string;
          outputDir?: string;
        };

        console.error(`[VIZ_AGENT][MCP] Processing request: "${prompt}"`);
        console.error(`[VIZ_AGENT][MCP] Data points: ${data.length}`);
        if (suggestedType) {
          console.error(`[VIZ_AGENT][MCP] Suggested type: ${suggestedType}`);
        }

        const vizRequest: VisualizationRequest = {
          prompt,
          data,
          suggestedType,
        };

        // Ejecutar el graph completo (planner -> generator -> saver)
        const result = await executeVisualization(
          vizRequest,
          DEFAULT_CHART_CONFIG,
          outputDir || './output'
        );
        
        const generationTimeMs = Date.now() - startTime;
        
        if (result.error) {
          throw new Error(result.error);
        }
        
        const response: VisualizationResponse = {
          success: true,
          imagePath: result.filePath || '',
          imageUrl: result.imageUrl || undefined,
          format: 'png',
          plan: result.plan || undefined,
          metadata: {
            timestamp: new Date().toISOString(),
            dataPoints: data.length,
            generationTimeMs,
          },
        };

        console.error(`[VIZ_AGENT][MCP] Visualization created successfully in ${generationTimeMs}ms`);
        console.error(`[VIZ_AGENT][MCP] Output: ${result.filePath}`);
        console.error(`[VIZ_AGENT][MCP] File size: ${result.fileSize} bytes`);

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(response, null, 2),
            },
          ],
        };
      } catch (error) {
        console.error('[VIZ_AGENT][MCP] Error processing request:', error);
        
        const generationTimeMs = Date.now() - startTime;
        const errorResponse: VisualizationResponse = {
          success: false,
          error: error instanceof Error ? error.message : String(error),
          metadata: {
            timestamp: new Date().toISOString(),
            dataPoints: 0,
            generationTimeMs,
          },
        };

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(errorResponse, null, 2),
            },
          ],
          isError: true,
        };
      }
    });
  }

  async run(): Promise<void> {
    console.error('[VIZ_AGENT][MCP] Starting server transport');
    
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    
    console.error('[VIZ_AGENT][MCP] Server running on stdio');

    process.on('SIGINT', async () => {
      console.error('[VIZ_AGENT][MCP] Received SIGINT, shutting down');
      await this.cleanup();
      process.exit(0);
    });

    process.on('SIGTERM', async () => {
      console.error('[VIZ_AGENT][MCP] Received SIGTERM, shutting down');
      await this.cleanup();
      process.exit(0);
    });
  }

  private async cleanup(): Promise<void> {
    console.error('[VIZ_AGENT][MCP] Cleaning up resources');
    try {
      await LLMFactory.dispose();
      console.error('[VIZ_AGENT][MCP] LLM resources disposed');
    } catch (error) {
      console.error('[VIZ_AGENT][MCP] Error during cleanup:', error);
    }
  }
}

const server = new VisualizationMCPServer();
server.run().catch((error) => {
  console.error('[VIZ_AGENT][MCP] Fatal error:', error);
  process.exit(1);
});
