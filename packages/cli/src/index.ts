#!/usr/bin/env node
import { createServer } from "node:http";
import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import {
  buildInstallUrl,
  createOAuthState,
  defaultAdminScopes,
  defaultConfigPath,
  exchangeCodeForOfflineToken,
  createConfig,
  emptyCapabilities,
  normalizeScopes,
  saveStoredConfig,
  scopesToString,
  validateOAuthCallback,
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

export interface AuthOptions {
  storeUrl?: string;
  clientId?: string;
  clientSecret?: string;
  scopes?: string;
  redirectPort?: number;
  readOnly?: boolean;
  open?: boolean;
  configPath?: string;
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

export async function runOAuthInstall(options: AuthOptions): Promise<{
  configPath: string;
  storeUrl: string;
  grantedScopes: string[];
}> {
  const interactive = !options.storeUrl || !options.clientId || !options.clientSecret;
  const rl = interactive ? createInterface({ input, output }) : undefined;
  try {
    const storeUrl = options.storeUrl ?? await rl!.question("Shopify store URL: ");
    const clientId = options.clientId ?? await rl!.question("Shopify app client ID: ");
    const clientSecret = options.clientSecret ?? await rl!.question("Shopify app client secret: ");
    const scopes = normalizeScopes(options.scopes ?? defaultAdminScopes);
    const port = options.redirectPort ?? 3456;
    const redirectUri = `http://127.0.0.1:${port}/auth/callback`;
    const state = createOAuthState();
    const installUrl = buildInstallUrl({
      shop: storeUrl,
      clientId,
      scopes,
      redirectUri,
      state,
      accessMode: "offline"
    });

    console.log("Open this Shopify install URL in your browser:");
    console.log(installUrl.toString());
    console.log(`\nWaiting for callback on ${redirectUri}`);

    const callback = await waitForOAuthCallback(port);
    validateOAuthCallback(callback, state, clientSecret);
    const token = await exchangeCodeForOfflineToken({
      shop: callback.shop ?? storeUrl,
      clientId,
      clientSecret,
      code: callback.code!
    });
    const config = createConfig({
      storeUrl: callback.shop ?? storeUrl,
      adminAccessToken: token.access_token,
      readOnly: options.readOnly ?? true
    });
    const configPath = options.configPath ?? defaultConfigPath();
    await saveStoredConfig({
      ...config,
      clientId,
      grantedScopes: normalizeScopes(token.scope)
    }, configPath);

    console.log(`\nSaved Shopify Store Agent config to ${configPath}`);
    console.log("Granted scopes:");
    console.log(scopesToString(normalizeScopes(token.scope)));

    return {
      configPath,
      storeUrl: config.storeUrl,
      grantedScopes: normalizeScopes(token.scope)
    };
  } finally {
    rl?.close();
  }
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

function parseArgs(argv: string[]): (SetupOptions & AuthOptions & { command: string }) {
  const [command = "help", ...rest] = argv;
  const options: SetupOptions & AuthOptions & { command: string } = { command };
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
    } else if (arg === "--client-id" && next) {
      options.clientId = next;
      index += 1;
    } else if (arg === "--client-secret" && next) {
      options.clientSecret = next;
      index += 1;
    } else if (arg === "--scopes" && next) {
      options.scopes = next;
      index += 1;
    } else if (arg === "--redirect-port" && next) {
      options.redirectPort = Number(next);
      index += 1;
    } else if (arg === "--config" && next) {
      options.configPath = next;
      index += 1;
    }
  }
  return options;
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  if (options.command !== "setup" && options.command !== "auth") {
    console.log("Usage:");
    console.log("  shopify-store-agent setup --store example.myshopify.com [--dry-run]");
    console.log("  shopify-store-agent auth --store example.myshopify.com --client-id ... --client-secret ...");
    return;
  }

  if (options.command === "auth") {
    await runOAuthInstall(options);
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

function waitForOAuthCallback(port: number): Promise<Record<string, string>> {
  return new Promise((resolve, reject) => {
    const server = createServer((request, response) => {
      if (!request.url) return;
      const url = new URL(request.url, `http://127.0.0.1:${port}`);
      if (url.pathname !== "/auth/callback") {
        response.writeHead(404);
        response.end("Not found");
        return;
      }
      const query = Object.fromEntries(url.searchParams.entries());
      response.writeHead(200, { "Content-Type": "text/plain" });
      response.end("Shopify Store Agent is authorized. You can close this browser tab.");
      server.close();
      resolve(query);
    });
    server.on("error", reject);
    server.listen(port, "127.0.0.1");
  });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}
