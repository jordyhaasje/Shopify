#!/usr/bin/env node
import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import {
  createConfig,
  emptyCapabilities,
  redactConfig,
  summarizeCapabilities,
  type StoreAgentConfig
} from "@shopify-store-agent/core";

export interface SetupOptions {
  storeUrl?: string;
  adminAccessToken?: string;
  themeAccessToken?: string;
  readOnly?: boolean;
  dryRun?: boolean;
}

export function generateMcpConfigSnippets(config: StoreAgentConfig): Record<string, string> {
  const env = {
    SHOPIFY_STORE_AGENT_STORE: config.storeUrl,
    SHOPIFY_STORE_AGENT_API_VERSION: config.apiVersion,
    SHOPIFY_STORE_AGENT_READ_ONLY: String(config.readOnly)
  };

  const command = "npx";
  const args = ["shopify-store-agent-mcp"];

  return {
    codex: [
      "[mcp_servers.shopify-store-agent]",
      `command = "${command}"`,
      `args = ${JSON.stringify(args)}`,
      "[mcp_servers.shopify-store-agent.env]",
      ...Object.entries(env).map(([key, value]) => `${key} = "${value}"`)
    ].join("\n"),
    claude: JSON.stringify({
      mcpServers: {
        "shopify-store-agent": {
          command,
          args,
          env
        }
      }
    }, null, 2),
    cursor: JSON.stringify({
      mcpServers: {
        "shopify-store-agent": {
          command,
          args,
          env
        }
      }
    }, null, 2)
  };
}

export async function runSetup(options: SetupOptions): Promise<{
  config: StoreAgentConfig;
  snippets: Record<string, string>;
}> {
  const interactive = !options.storeUrl;
  const rl = interactive ? createInterface({ input, output }) : undefined;
  try {
    const storeUrl = options.storeUrl ?? await rl!.question("Shopify store URL: ");
    const adminAccessToken = options.adminAccessToken ?? (interactive ? await rl!.question("Admin API token (optional for dry run): ") : undefined);
    const themeAccessToken = options.themeAccessToken ?? (interactive ? await rl!.question("Theme Access token (optional): ") : undefined);
    const config = createConfig({
      storeUrl,
      adminAccessToken: adminAccessToken || undefined,
      themeAccessToken: themeAccessToken || undefined,
      readOnly: options.readOnly ?? true,
      capabilities: options.dryRun ? emptyCapabilities() : undefined
    });
    return {
      config,
      snippets: generateMcpConfigSnippets(config)
    };
  } finally {
    rl?.close();
  }
}

function parseArgs(argv: string[]): SetupOptions & { command: string } {
  const [command = "help", ...rest] = argv;
  const options: SetupOptions & { command: string } = { command };
  for (let index = 0; index < rest.length; index += 1) {
    const arg = rest[index];
    const next = rest[index + 1];
    if (arg === "--store" && next) {
      options.storeUrl = next;
      index += 1;
    } else if (arg === "--admin-token" && next) {
      options.adminAccessToken = next;
      index += 1;
    } else if (arg === "--theme-token" && next) {
      options.themeAccessToken = next;
      index += 1;
    } else if (arg === "--write-enabled") {
      options.readOnly = false;
    } else if (arg === "--dry-run") {
      options.dryRun = true;
    }
  }
  return options;
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  if (options.command !== "setup") {
    console.log("Usage: shopify-store-agent setup --store example.myshopify.com [--dry-run]");
    return;
  }

  const result = await runSetup(options);
  const safeConfig = redactConfig(result.config);
  console.log("Shopify Store Agent setup preview");
  console.log(JSON.stringify(safeConfig, null, 2));
  console.log("\nCapability checks");
  for (const probe of summarizeCapabilities(result.config.capabilities ?? emptyCapabilities())) {
    console.log(`- ${probe.name}: ${probe.detail}`);
  }
  console.log("\nCodex MCP config");
  console.log(result.snippets.codex);
  console.log("\nClaude/Cursor MCP config");
  console.log(result.snippets.claude);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}
