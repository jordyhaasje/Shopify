#!/usr/bin/env node
import { createInterface } from "node:readline";
import { stdin, stdout } from "node:process";
import { callTool, createDefaultContext, listTools } from "./tools.js";

interface JsonRpcRequest {
  id?: string | number;
  method: string;
  params?: Record<string, unknown>;
}

const context = createDefaultContext();

function writeResponse(id: string | number | undefined, result: unknown): void {
  stdout.write(`${JSON.stringify({ jsonrpc: "2.0", id, result })}\n`);
}

function writeError(id: string | number | undefined, error: unknown): void {
  const message = error instanceof Error ? error.message : String(error);
  stdout.write(`${JSON.stringify({ jsonrpc: "2.0", id, error: { code: -32000, message } })}\n`);
}

export async function handleRequest(request: JsonRpcRequest): Promise<unknown> {
  if (request.method === "initialize") {
    return {
      protocolVersion: "2024-11-05",
      serverInfo: { name: "shopify-store-agent-mcp", version: "0.1.0" },
      capabilities: { tools: {} }
    };
  }
  if (request.method === "tools/list") {
    return { tools: listTools() };
  }
  if (request.method === "tools/call") {
    const params = request.params ?? {};
    const name = typeof params.name === "string" ? params.name : "";
    const args = typeof params.arguments === "object" && params.arguments ? params.arguments as Record<string, unknown> : {};
    const result = await callTool(name, args, context);
    return {
      content: [{ type: "text", text: JSON.stringify(result, null, 2) }]
    };
  }
  throw new Error(`Unsupported method: ${request.method}`);
}

async function main(): Promise<void> {
  const rl = createInterface({ input: stdin, terminal: false });
  rl.on("line", (line) => {
    void (async () => {
      try {
        const request = JSON.parse(line) as JsonRpcRequest;
        const result = await handleRequest(request);
        writeResponse(request.id, result);
      } catch (error) {
        writeError(undefined, error);
      }
    })();
  });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}
