#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/server";
import { StdioServerTransport } from "@modelcontextprotocol/server/stdio";
import * as z from "zod/v4";
import { callTool, createDefaultContext, listTools } from "./tools.js";

export { callTool, createDefaultContext, listTools, type ToolContext } from "./tools.js";

export async function createShopifyStoreAgentServer(): Promise<McpServer> {
  const server = new McpServer({
    name: "shopify-store-agent-mcp",
    version: "0.1.0"
  });
  const context = await createDefaultContext();

  for (const tool of listTools()) {
    server.registerTool(
      tool.name,
      {
        description: tool.description,
        inputSchema: z.object({}).passthrough()
      },
      async (input) => {
        const result = await callTool(tool.name, input, context);
        return {
          content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }]
        };
      }
    );
  }

  return server;
}

export async function main(): Promise<void> {
  const server = await createShopifyStoreAgentServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Shopify Store Agent MCP server running on stdio");
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}
