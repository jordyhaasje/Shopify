#!/usr/bin/env node
import { createServer } from "node:http";
import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import {
  buildInstallUrl,
  checkShopifyCapabilities,
  type CapabilityCheckResult,
  createOAuthState,
  defaultApiVersion,
  defaultConfigPath,
  defaultReadOnlyAdminScopes,
  exchangeCodeForOfflineToken,
  createConfig,
  emptyCapabilities,
  type FetchLike,
  normalizeScopes,
  saveStoredConfig,
  scopesToString,
  type TokenFetch,
  validateOAuthCallback,
  redactConfig,
  summarizeCapabilities,
  type StoreAgentConfig
} from "@shopify-store-agent/core";

export interface SetupOptions {
  storeUrl?: string;
  authMethod?: "manual" | "oauth";
  adminAccessToken?: string;
  themeAccessToken?: string;
  clientId?: string;
  scopes?: string;
  apiVersion?: string;
  configPath?: string;
  readOnly?: boolean;
  saveConfig?: boolean;
  liveCapabilityCheck?: boolean;
  dryRun?: boolean;
  fetcher?: FetchLike;
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
  tokenFetcher?: TokenFetch;
}

export interface SetupWarning {
  code: string;
  message: string;
}

export interface SetupResult {
  config: StoreAgentConfig;
  safeConfig: StoreAgentConfig;
  configPath: string;
  saved: boolean;
  authMethod: "manual" | "oauth";
  scopes: string[];
  scopeSummary: string;
  capabilityCheck: CapabilityCheckResult;
  warnings: SetupWarning[];
  snippets: Record<"codex" | "claude" | "cursor" | "generic", string>;
  nextSteps: string[];
}

export function generateMcpConfigSnippets(config: StoreAgentConfig, options: { configPath?: string } = {}): Record<"codex" | "claude" | "cursor" | "generic", string> {
  const env = {
    SHOPIFY_STORE_AGENT_CONFIG: options.configPath ?? defaultConfigPath(),
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
    }, null, 2),
    generic: JSON.stringify({
      name: "shopify-store-agent",
      command,
      args,
      env
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
    const readOnly = options.readOnly ?? true;
    const scopes = resolveSetupScopes(options.scopes, readOnly);
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
    }, options.tokenFetcher);
    const config = createConfig({
      storeUrl: callback.shop ?? storeUrl,
      adminAccessToken: token.access_token,
      readOnly
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
  safeConfig: StoreAgentConfig;
  configPath: string;
  saved: boolean;
  authMethod: "manual" | "oauth";
  scopes: string[];
  scopeSummary: string;
  capabilityCheck: CapabilityCheckResult;
  warnings: SetupWarning[];
  snippets: Record<"codex" | "claude" | "cursor" | "generic", string>;
  nextSteps: string[];
}> {
  const interactive = !options.storeUrl;
  const rl = interactive ? createInterface({ input, output }) : undefined;
  try {
    const storeUrl = options.storeUrl ?? await rl!.question("Shopify store URL: ");
    const authMethod = normalizeAuthMethod(options.authMethod ?? (interactive ? await rl!.question("Auth method [manual/oauth] (default manual): ") : undefined));
    const adminAccessToken = authMethod === "manual"
      ? options.adminAccessToken ?? (interactive ? await rl!.question("Admin API token (optional, stored locally only): ") : undefined)
      : undefined;
    const clientId = authMethod === "oauth"
      ? options.clientId ?? (interactive ? await rl!.question("OAuth client ID (optional, local setup only): ") : undefined)
      : undefined;
    const themeAccessToken = options.themeAccessToken ?? (interactive ? await rl!.question("Theme Access token (optional, stored locally only): ") : undefined);
    const configPath = options.configPath ?? defaultConfigPath();
    const readOnly = options.readOnly ?? true;
    const scopes = resolveSetupScopes(options.scopes, readOnly);
    const warnings = setupWarnings(readOnly, scopes);
    const config = createConfig({
      storeUrl,
      adminAccessToken: adminAccessToken || undefined,
      themeAccessToken: themeAccessToken || undefined,
      apiVersion: options.apiVersion ?? defaultApiVersion,
      readOnly,
      capabilities: options.dryRun ? emptyCapabilities() : undefined
    });
    const capabilityCheck = await checkShopifyCapabilities(config, {
      live: options.liveCapabilityCheck === true,
      fetcher: options.fetcher
    });

    const shouldSave = options.saveConfig === true && !options.dryRun;
    if (shouldSave) {
      await saveStoredConfig({
        ...config,
        clientId: clientId || undefined,
        grantedScopes: scopes
      }, configPath);
    }

    const safeConfig = redactConfig(config);
    return {
      config: safeConfig,
      safeConfig,
      configPath,
      saved: shouldSave,
      authMethod,
      scopes,
      scopeSummary: scopesToString(scopes),
      capabilityCheck,
      warnings,
      snippets: generateMcpConfigSnippets(config, { configPath }),
      nextSteps: setupNextSteps(authMethod, configPath)
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
    } else if (arg === "--auth" && next) {
      options.authMethod = next === "oauth" ? "oauth" : "manual";
      index += 1;
    } else if (arg === "--api-version" && next) {
      options.apiVersion = next;
      index += 1;
    } else if (arg === "--write-enabled") {
      options.readOnly = false;
    } else if (arg === "--dry-run") {
      options.dryRun = true;
    } else if (arg === "--live-capability-check") {
      options.liveCapabilityCheck = true;
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
    console.log("  shopify-store-agent setup --store example.myshopify.com [--auth manual|oauth] [--dry-run]");
    console.log("  shopify-store-agent auth --store example.myshopify.com --client-id ... --client-secret ...");
    return;
  }

  if (options.command === "auth") {
    await runOAuthInstall(options);
    return;
  }

  const result = await runSetup({ ...options, saveConfig: !options.dryRun });
  console.log("Shopify Store Agent setup preview");
  console.log(JSON.stringify(result.safeConfig, null, 2));
  console.log(`\nConfig path: ${result.configPath}`);
  console.log(`Saved: ${result.saved ? "yes" : "no"}`);
  console.log(`Auth method: ${result.authMethod}`);
  console.log(`Read-only mode: ${result.config.readOnly ? "enabled" : "disabled"}`);
  console.log(`Scopes for setup guidance: ${result.scopeSummary}`);
  for (const warning of result.warnings) {
    console.log(`Warning: ${warning.message}`);
  }
  console.log("\nCapability checks");
  for (const probe of summarizeCapabilities(result.config.capabilities ?? emptyCapabilities())) {
    console.log(`- ${probe.name}: ${probe.detail}`);
  }
  for (const diagnostic of result.capabilityCheck.diagnostics) {
    console.log(`- ${diagnostic.code}: ${diagnostic.message}`);
  }
  console.log("\nNext steps");
  for (const step of result.nextSteps) {
    console.log(`- ${step}`);
  }
  console.log("\nCodex MCP config");
  console.log(result.snippets.codex);
  console.log("\nClaude Code MCP config");
  console.log(result.snippets.claude);
  console.log("\nCursor MCP config");
  console.log(result.snippets.cursor);
  console.log("\nGeneric MCP config");
  console.log(result.snippets.generic);
}

function normalizeAuthMethod(value: unknown): "manual" | "oauth" {
  return typeof value === "string" && value.trim().toLowerCase() === "oauth" ? "oauth" : "manual";
}

function resolveSetupScopes(input: string | readonly string[] | undefined, readOnly: boolean): string[] {
  const scopes = normalizeScopes(input ?? defaultReadOnlyAdminScopes);
  const writeScopes = scopes.filter((scope) => scope.toLowerCase().startsWith("write_"));
  if (readOnly && writeScopes.length > 0) {
    throw new Error("write_scopes_blocked: Write scopes require --write-enabled, and Shopify write tools are not implemented yet.");
  }
  return scopes;
}

function setupWarnings(readOnly: boolean, scopes: readonly string[]): SetupWarning[] {
  const warnings: SetupWarning[] = [];
  if (!readOnly) {
    warnings.push({
      code: "write_mode_requested",
      message: "Write mode was requested in config, but setup does not implement or activate Shopify execute/write tools."
    });
  }
  if (scopes.some((scope) => scope.toLowerCase().startsWith("write_"))) {
    warnings.push({
      code: "write_scopes_requested",
      message: "Write scopes were explicitly requested, but Shopify write tools are not implemented yet."
    });
  }
  return warnings;
}

function setupNextSteps(authMethod: "manual" | "oauth", configPath: string): string[] {
  const common = [
    `Point your MCP host at the local config path: ${configPath}.`,
    "Keep read-only mode enabled until you intentionally review future write capabilities."
  ];
  if (authMethod === "oauth") {
    return [
      "Run the local OAuth auth command with your own Shopify app client credentials to store an Admin API token locally.",
      ...common
    ];
  }
  return [
    "Create or use a Shopify custom app token with only the scopes needed for read and preview workflows.",
    ...common
  ];
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
