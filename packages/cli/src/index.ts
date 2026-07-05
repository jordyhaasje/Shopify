#!/usr/bin/env node
import { existsSync } from "node:fs";
import { createServer } from "node:http";
import { dirname, resolve } from "node:path";
import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { fileURLToPath } from "node:url";
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
  hashPreviewContent,
  MemoryAuditLog,
  MemoryPreviewStore,
  loadStoredConfig,
  normalizeStoreUrl,
  normalizeScopes,
  previewRecordBindingTarget,
  reviewedPayloadForPreviewRecord,
  saveStoredConfig,
  scopesToString,
  type TokenFetch,
  validateOAuthCallback,
  redactConfig,
  summarizeCapabilities,
  type StoreAgentConfig
} from "@shopify-store-agent/core";
import { callTool, type ToolContext } from "shopify-store-agent-mcp";

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
  mcpCommandMode?: McpCommandMode;
  localMcpServerPath?: string;
}

export interface AuthOptions {
  storeUrl?: string;
  clientId?: string;
  clientSecret?: string;
  clientSecretPrompt?: (prompt: string) => Promise<string>;
  scopes?: string;
  redirectPort?: number;
  readOnly?: boolean;
  open?: boolean;
  configPath?: string;
  tokenFetcher?: TokenFetch;
}

export interface SmokeOptions {
  storeUrl?: string;
  configPath?: string;
  live?: boolean;
  adminAccessToken?: string;
  fetcher?: FetchLike;
}

export interface DevStoreE2ePreflightOptions {
  storeUrl?: string;
  configPath?: string;
  requiredScopes?: string;
  requireWriteEnabled?: boolean;
}

export interface SetupCheckOptions {
  storeUrl?: string;
  configPath?: string;
  mcpCommandMode?: McpCommandMode;
  localMcpServerPath?: string;
}

export interface SetupWarning {
  code: string;
  message: string;
}

export type McpCommandMode = "local" | "npx";

const implementedWriteExecuteTools = [
  "page.create.execute",
  "product.create.execute",
  "product.update.execute",
  "product.media.update.execute",
  "collection.create.execute",
  "inventory.setQuantity.execute",
  "inventory.adjustQuantity.execute",
  "inventory.moveQuantity.execute",
  "inventory.transfer.execute",
  "inventory.transfer.addItems.execute",
  "inventory.transfer.markReady.execute",
  "inventory.transfer.cancel.execute",
  "inventory.transfer.ship.execute",
  "inventory.transfer.receive.execute"
] as const;

const implementedWriteExecuteToolsText = implementedWriteExecuteTools.join(", ");

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
  firstPrompts: string[];
  nextSteps: string[];
}

export interface SmokeCheck {
  name: string;
  ok: boolean;
  detail: string;
}

export interface SmokeValidationResult {
  ok: boolean;
  mode: "local" | "live";
  storeUrl: string;
  configPath: string;
  readOnly: boolean;
  fetchCalls: number;
  checks: SmokeCheck[];
  snippets: Record<"codex" | "claude" | "cursor" | "generic", string>;
  capabilityCheck: CapabilityCheckResult;
  previewId?: string;
  previewHash?: string;
  execute: {
    invalidStatus?: string;
    invalidAuditResult?: string;
    validStatus?: string;
    validAuditResult?: string;
    anySuccessAudit: boolean;
  };
}

export interface DevStoreE2ePreflightResult {
  ok: boolean;
  mode: "local";
  configPath: string;
  expectedStoreUrl?: string;
  configuredStoreUrl?: string;
  readOnly?: boolean;
  adminApiTokenConfigured: boolean;
  requiredScopes: string[];
  checks: SmokeCheck[];
}

export interface SetupCheckResult {
  ok: boolean;
  mode: "local";
  expectedStoreUrl?: string;
  configuredStoreUrl?: string;
  readOnly?: boolean;
  adminApiTokenConfigured: boolean;
  themeAccessTokenConfigured: boolean;
  fetchCalls: 0;
  checks: SmokeCheck[];
  snippetHosts: Array<"codex" | "claude" | "cursor" | "generic">;
  firstPrompts: string[];
  nextSteps: string[];
}

export function resolveLocalMcpServerPath(): string {
  return resolve(dirname(fileURLToPath(import.meta.url)), "../../mcp/dist/server.js");
}

export function resolveMcpCommand(options: { mode?: McpCommandMode; localMcpServerPath?: string } = {}): { command: string; args: string[] } {
  if (options.mode === "npx") {
    return { command: "npx", args: ["shopify-store-agent-mcp"] };
  }
  return {
    command: "node",
    args: [options.localMcpServerPath ?? resolveLocalMcpServerPath()]
  };
}

export function generateMcpConfigSnippets(config: StoreAgentConfig, options: {
  configPath?: string;
  mcpCommandMode?: McpCommandMode;
  localMcpServerPath?: string;
} = {}): Record<"codex" | "claude" | "cursor" | "generic", string> {
  const env = {
    SHOPIFY_STORE_AGENT_CONFIG: options.configPath ?? defaultConfigPath(),
    SHOPIFY_STORE_AGENT_STORE: config.storeUrl,
    SHOPIFY_STORE_AGENT_API_VERSION: config.apiVersion,
    SHOPIFY_STORE_AGENT_READ_ONLY: String(config.readOnly)
  };

  const { command, args } = resolveMcpCommand({
    mode: options.mcpCommandMode ?? "local",
    localMcpServerPath: options.localMcpServerPath
  });

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

export async function runSmokeValidation(options: SmokeOptions = {}): Promise<SmokeValidationResult> {
  let fetchCalls = 0;
  const fetcher: FetchLike = async (url, init) => {
    fetchCalls += 1;
    if (options.fetcher) return options.fetcher(url, init);
    return {
      ok: true,
      status: 200,
      async text() {
        return JSON.stringify({
          data: {
            shop: {
              name: "Smoke Test Shop",
              myshopifyDomain: "smoke-test.myshopify.com",
              primaryDomain: { host: "smoke-test.example" }
            }
          }
        });
      }
    };
  };
  const setup = await runSetup({
    storeUrl: options.storeUrl ?? "smoke-test",
    adminAccessToken: options.adminAccessToken,
    configPath: options.configPath,
    dryRun: true,
    liveCapabilityCheck: options.live === true,
    fetcher: options.live === true ? fetcher : undefined
  });
  const config = createConfig({
    storeUrl: setup.config.storeUrl,
    apiVersion: setup.config.apiVersion,
    readOnly: true,
    capabilities: emptyCapabilities()
  });
  const previewStore = new MemoryPreviewStore();
  const context: ToolContext = {
    config,
    audit: new MemoryAuditLog(),
    previewStore,
    fetcher: async () => {
      fetchCalls += 1;
      return {
        ok: true,
        status: 200,
        async text() {
          return "{}";
        }
      };
    }
  };

  const checks: SmokeCheck[] = [];
  checks.push(check("config_path_available", Boolean(setup.configPath), "Config path can be resolved."));
  checks.push(check("store_url_normalized", setup.config.storeUrl === "smoke-test.myshopify.com" || setup.config.storeUrl.includes("."), `Store URL normalized to ${setup.config.storeUrl}.`));
  checks.push(check("read_only_default", setup.config.readOnly === true, "Setup defaults to read-only mode."));
  checks.push(check("capability_check", setup.capabilityCheck.mode === (options.live ? "live" : "local"), `Capability check ran in ${setup.capabilityCheck.mode} mode.`));
  checks.push(check("mcp_snippets", Object.values(setup.snippets).every((snippet) => snippet.includes("shopify-store-agent")), "MCP snippets generated for supported hosts."));

  const preview = await callTool("product.create.preview", {
    title: "Smoke Test Product",
    description: "Local smoke validation product preview."
  }, context) as Record<string, unknown>;
  const previewId = typeof preview.previewId === "string" ? preview.previewId : undefined;
  const previewHash = typeof preview.previewHash === "string" ? preview.previewHash : undefined;
  const stored = previewStore.getPreview(previewId);
  checks.push(check("preview_output", preview.ok === true && preview.status === "ok", "Product create preview generated."));
  checks.push(check("preview_store_record", stored.ok === true, "Preview store received a record."));

  const placeholderPreview = await callTool("product.importFromUserUrl.preview", {
    url: "https://example.com/products/smoke-test-product",
    instructions: "Plan an original rewrite only."
  }, context) as Record<string, unknown>;
  const placeholderPreviewId = typeof placeholderPreview.previewId === "string" ? placeholderPreview.previewId : undefined;
  const placeholderPreviewHash = typeof placeholderPreview.previewHash === "string" ? placeholderPreview.previewHash : undefined;
  const placeholderBinding = placeholderPreview.binding && typeof placeholderPreview.binding === "object" ? placeholderPreview.binding as Record<string, unknown> : {};
  const placeholderStored = previewStore.getPreview(placeholderPreviewId);

  const executeContext: ToolContext = {
    ...context,
    config: createConfig({
      storeUrl: config.storeUrl,
      readOnly: false,
      capabilities: emptyCapabilities()
    })
  };
  const invalidExecute = await callTool("product.importFromUserUrl.execute", {
    previewId: placeholderPreviewId,
    confirmed: true,
    reviewedPayload: { arbitrary: "payload" },
    expectedTool: placeholderBinding.expectedTool,
    target: placeholderBinding.target,
    previewHash: placeholderPreviewHash,
    reviewedChangesHash: placeholderPreviewHash,
    url: "https://example.com/products/smoke-test-product"
  }, executeContext) as Record<string, unknown>;
  checks.push(check("invalid_execute_blocked", invalidExecute.status === "blocked", "Invalid execute binding is blocked."));

  const activeRecord = placeholderStored.record;
  const reviewedPayload = activeRecord ? reviewedPayloadForPreviewRecord(activeRecord) : {};
  const reviewedChangesHash = hashPreviewContent(reviewedPayload);
  const target = activeRecord ? previewRecordBindingTarget(activeRecord) : placeholderBinding.target;
  const validExecute = await callTool("product.importFromUserUrl.execute", {
    previewId: placeholderPreviewId,
    confirmed: true,
    reviewedPayload,
    expectedTool: placeholderBinding.expectedTool,
    target,
    previewHash: placeholderPreviewHash,
    reviewedChangesHash,
    url: "https://example.com/products/smoke-test-product"
  }, executeContext) as Record<string, unknown>;
  checks.push(check("valid_execute_not_implemented", validExecute.status === "not_implemented", "Valid stored binding reaches only the not-implemented placeholder."));

  const auditEntries = executeContext.audit.list();
  const anySuccessAudit = auditEntries.some((entry) => entry.mode === "execute" && entry.result === "success");
  checks.push(check("execute_never_success", !anySuccessAudit, "Execute placeholders never audit success."));
  checks.push(check("no_default_fetch", options.live === true || fetchCalls === 0, "Default smoke validation made no fetch calls."));

  return {
    ok: checks.every((item) => item.ok),
    mode: options.live ? "live" : "local",
    storeUrl: setup.config.storeUrl,
    configPath: setup.configPath,
    readOnly: setup.config.readOnly,
    fetchCalls,
    checks,
    snippets: setup.snippets,
    capabilityCheck: setup.capabilityCheck,
    previewId,
    previewHash,
    execute: {
      invalidStatus: stringField(invalidExecute.status),
      invalidAuditResult: auditResult(invalidExecute),
      validStatus: stringField(validExecute.status),
      validAuditResult: auditResult(validExecute),
      anySuccessAudit
    }
  };
}

export async function runDevStoreE2ePreflight(options: DevStoreE2ePreflightOptions = {}): Promise<DevStoreE2ePreflightResult> {
  const configPath = options.configPath ?? defaultConfigPath();
  const requiredScopes = options.requiredScopes ? normalizeScopes(options.requiredScopes) : [];
  const expectedStoreUrl = options.storeUrl ? createConfig({ storeUrl: options.storeUrl }).storeUrl : undefined;
  const stored = await loadStoredConfig(configPath);
  const checks: SmokeCheck[] = [];

  checks.push(check("config_exists", Boolean(stored), `Config ${stored ? "found" : "missing"} at ${configPath}.`));

  if (!stored) {
    checks.push(check("no_fetch", true, "Preflight is local-only and made no Shopify fetch calls."));
    return {
      ok: false,
      mode: "local",
      configPath,
      expectedStoreUrl,
      adminApiTokenConfigured: false,
      requiredScopes,
      checks
    };
  }

  const configuredStoreUrl = stored.storeUrl;
  if (expectedStoreUrl) {
    checks.push(check("store_matches", configuredStoreUrl === expectedStoreUrl, `Config store is ${configuredStoreUrl}; expected ${expectedStoreUrl}.`));
  }
  checks.push(check("admin_token_configured", Boolean(stored.adminAccessToken), "Admin API token is configured locally."));

  const grantedScopes = new Set(normalizeScopes(stored.grantedScopes ?? []));
  const missingScopes = requiredScopes.filter((scope) => !hasEffectiveScope(grantedScopes, scope));
  checks.push(check("required_scopes_configured", missingScopes.length === 0, missingScopes.length === 0 ? "Required scopes are present or implied by granted write scopes in local grantedScopes." : `Missing required scopes: ${missingScopes.join(", ")}.`));

  const writeRequired = options.requireWriteEnabled === true || requiredScopes.some((scope) => scope.startsWith("write_"));
  if (writeRequired) {
    checks.push(check("write_mode_enabled", stored.readOnly === false, "Read-only mode is disabled only for deliberate dev-store write E2E."));
  }

  checks.push(check("no_fetch", true, "Preflight is local-only and made no Shopify fetch calls."));

  return {
    ok: checks.every((item) => item.ok),
    mode: "local",
    configPath,
    expectedStoreUrl,
    configuredStoreUrl,
    readOnly: stored.readOnly,
    adminApiTokenConfigured: Boolean(stored.adminAccessToken),
    requiredScopes,
    checks
  };
}

export async function runSetupCheck(options: SetupCheckOptions = {}): Promise<SetupCheckResult> {
  const configPath = options.configPath ?? defaultConfigPath();
  const expectedStoreUrl = options.storeUrl ? createConfig({ storeUrl: options.storeUrl }).storeUrl : undefined;
  const stored = await loadStoredConfig(configPath);
  const checks: SmokeCheck[] = [];
  const firstPrompts = setupFirstPrompts();
  const nextSteps = [
    "If config is missing, run setup and then auth before adding the MCP snippet to your AI host.",
    "If the local MCP server build is missing, run pnpm run build from the Shopify Store Agent repo.",
    "After the MCP host is configured, start with one of the safe First AI prompts and keep write mode disabled for normal-store onboarding."
  ];

  checks.push(check("config_exists", Boolean(stored), `Config ${stored ? "found" : "missing"}.`));

  if (!stored) {
    checks.push(check("no_fetch", true, "Setup check is local-only and made no Shopify fetch calls."));
    return {
      ok: false,
      mode: "local",
      expectedStoreUrl,
      adminApiTokenConfigured: false,
      themeAccessTokenConfigured: false,
      fetchCalls: 0,
      checks,
      snippetHosts: [],
      firstPrompts,
      nextSteps
    };
  }

  if (expectedStoreUrl) {
    checks.push(check("store_matches", stored.storeUrl === expectedStoreUrl, `Config store is ${stored.storeUrl}; expected ${expectedStoreUrl}.`));
  }
  checks.push(check("admin_token_configured", Boolean(stored.adminAccessToken), "Admin API token is configured locally."));
  checks.push(check("read_only_mode", stored.readOnly !== false, stored.readOnly === false ? "Read-only mode is disabled; use only for deliberate reviewed development-store write tests." : "Read-only mode is enabled for safe onboarding."));

  const snippets = generateMcpConfigSnippets(stored, {
    configPath,
    mcpCommandMode: options.mcpCommandMode,
    localMcpServerPath: options.localMcpServerPath
  });
  const snippetOutput = JSON.stringify(snippets);
  const secrets = [stored.adminAccessToken, stored.themeAccessToken].filter((value): value is string => Boolean(value));
  checks.push(check("mcp_snippets_safe", secrets.every((secret) => !snippetOutput.includes(secret)), "MCP snippets include only non-secret environment values."));
  const snippetHosts = Object.keys(snippets) as Array<"codex" | "claude" | "cursor" | "generic">;

  const mcpCommand = resolveMcpCommand({
    mode: options.mcpCommandMode ?? "local",
    localMcpServerPath: options.localMcpServerPath
  });
  const localServerPath = mcpCommand.command === "node" ? mcpCommand.args[0] : undefined;
  if (localServerPath) {
    checks.push(check("mcp_server_built", existsSync(localServerPath), `Local MCP server path ${existsSync(localServerPath) ? "exists" : "is missing"}.`));
  }

  checks.push(check("first_prompts_available", firstPrompts.length > 0 && firstPrompts.every((prompt) => !prompt.includes("gid://") && !prompt.includes("previewHash")), "Safe ordinary-language starter prompts are available."));
  checks.push(check("no_fetch", true, "Setup check is local-only and made no Shopify fetch calls."));

  return {
    ok: checks.every((item) => item.ok),
    mode: "local",
    expectedStoreUrl,
    configuredStoreUrl: stored.storeUrl,
    readOnly: stored.readOnly,
    adminApiTokenConfigured: Boolean(stored.adminAccessToken),
    themeAccessTokenConfigured: Boolean(stored.themeAccessToken),
    fetchCalls: 0,
    checks,
    snippetHosts,
    firstPrompts,
    nextSteps
  };
}

export async function runOAuthInstall(options: AuthOptions): Promise<{
  configPath: string;
  storeUrl: string;
  grantedScopes: string[];
}> {
  const interactive = !options.storeUrl || !options.clientId || !options.clientSecret;
  let rl = interactive ? createInterface({ input, output }) : undefined;
  try {
    const storeUrl = options.storeUrl ?? await rl!.question("Shopify store URL: ");
    const clientId = options.clientId ?? await rl!.question("Shopify app client ID: ");
    let clientSecret = options.clientSecret;
    if (!clientSecret) {
      rl?.close();
      rl = undefined;
      clientSecret = await (options.clientSecretPrompt ?? questionHidden)("Shopify app client secret: ");
    }
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
    const expectedShop = normalizeStoreUrl(storeUrl);
    const callbackShop = normalizeStoreUrl(callback.shop);
    if (callbackShop !== expectedShop) {
      console.log(`OAuth callback returned canonical shop ${callbackShop}; requested ${expectedShop}. Storing the canonical Shopify shop domain.`);
    }
    const token = await exchangeCodeForOfflineToken({
      shop: callbackShop,
      clientId,
      clientSecret,
      code: callback.code!
    }, options.tokenFetcher);
    const config = createConfig({
      storeUrl: callbackShop,
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
    console.log("OAuth browser flow complete. The Admin API token was stored only in local config.");
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
  firstPrompts: string[];
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

    const shouldSave = options.saveConfig === true && !options.dryRun && authMethod !== "oauth";
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
      snippets: generateMcpConfigSnippets(config, {
        configPath,
        mcpCommandMode: options.mcpCommandMode,
        localMcpServerPath: options.localMcpServerPath
      }),
      firstPrompts: setupFirstPrompts(),
      nextSteps: setupNextSteps(authMethod, configPath)
    };
  } finally {
    rl?.close();
  }
}

function parseArgs(argv: string[]): (SetupOptions & AuthOptions & SmokeOptions & DevStoreE2ePreflightOptions & SetupCheckOptions & { command: string }) {
  const [command = "help", ...rest] = argv;
  const options: SetupOptions & AuthOptions & SmokeOptions & DevStoreE2ePreflightOptions & SetupCheckOptions & { command: string } = { command };
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
    } else if (arg === "--live") {
      options.live = true;
    } else if (arg === "--client-id" && next) {
      options.clientId = next;
      index += 1;
    } else if (arg === "--client-secret" && next) {
      options.clientSecret = next;
      index += 1;
    } else if (arg === "--scopes" && next) {
      options.scopes = next;
      index += 1;
    } else if (arg === "--required-scopes" && next) {
      options.requiredScopes = next;
      index += 1;
    } else if (arg === "--require-write-enabled") {
      options.requireWriteEnabled = true;
    } else if (arg === "--redirect-port" && next) {
      options.redirectPort = Number(next);
      index += 1;
    } else if (arg === "--config" && next) {
      options.configPath = next;
      index += 1;
    } else if (arg === "--mcp-command" && next) {
      options.mcpCommandMode = next === "npx" ? "npx" : "local";
      index += 1;
    } else if (arg === "--local-mcp-server" && next) {
      options.localMcpServerPath = next;
      index += 1;
    }
  }
  return options;
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  if (options.command !== "setup" && options.command !== "setup-check" && options.command !== "auth" && options.command !== "smoke" && options.command !== "e2e-preflight") {
    console.log("Usage:");
    console.log("  shopify-store-agent setup --store example.myshopify.com [--auth manual|oauth] [--dry-run] [--mcp-command local|npx]");
    console.log("  shopify-store-agent setup-check [--store example.myshopify.com] [--config /path/config.json]");
    console.log("  shopify-store-agent auth --store example.myshopify.com --client-id ... --client-secret ...");
    console.log("  shopify-store-agent smoke [--store example.myshopify.com] [--live]");
    console.log("  shopify-store-agent e2e-preflight --store example.myshopify.com --config /path/config.json --required-scopes read_products,write_products [--require-write-enabled]");
    return;
  }

  if (options.command === "auth") {
    await runOAuthInstall(options);
    return;
  }

  if (options.command === "smoke") {
    const result = await runSmokeValidation({
      storeUrl: options.storeUrl,
      configPath: options.configPath,
      live: options.live === true,
      adminAccessToken: options.adminAccessToken
    });
    console.log(JSON.stringify(redactSmokeResult(result), null, 2));
    if (!result.ok) process.exitCode = 1;
    return;
  }

  if (options.command === "setup-check") {
    const result = await runSetupCheck({
      storeUrl: options.storeUrl,
      configPath: options.configPath,
      mcpCommandMode: options.mcpCommandMode,
      localMcpServerPath: options.localMcpServerPath
    });
    console.log(JSON.stringify(result, null, 2));
    if (!result.ok) process.exitCode = 1;
    return;
  }

  if (options.command === "e2e-preflight") {
    const result = await runDevStoreE2ePreflight({
      storeUrl: options.storeUrl,
      configPath: options.configPath,
      requiredScopes: options.requiredScopes,
      requireWriteEnabled: options.requireWriteEnabled
    });
    console.log(JSON.stringify(result, null, 2));
    if (!result.ok) process.exitCode = 1;
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
  console.log("\nFirst AI prompts");
  for (const prompt of result.firstPrompts) {
    console.log(`- ${prompt}`);
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

function check(name: string, ok: boolean, detail: string): SmokeCheck {
  return { name, ok, detail };
}

function stringField(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function auditResult(value: Record<string, unknown>): string | undefined {
  const audit = value.audit;
  if (!audit || typeof audit !== "object" || !("result" in audit)) return undefined;
  return stringField((audit as { result?: unknown }).result);
}

function redactSmokeResult(result: SmokeValidationResult): SmokeValidationResult {
  return JSON.parse(JSON.stringify(result).replace(/shpat_[A-Za-z0-9_]+|shpua_[A-Za-z0-9_]+|ghp_[A-Za-z0-9_]+|Bearer\s+[A-Za-z0-9._-]+/gi, "[redacted]")) as SmokeValidationResult;
}

function hasEffectiveScope(grantedScopes: Set<string>, requiredScope: string): boolean {
  if (grantedScopes.has(requiredScope)) return true;
  if (!requiredScope.startsWith("read_")) return false;
  return grantedScopes.has(`write_${requiredScope.slice("read_".length)}`);
}

function resolveSetupScopes(input: string | readonly string[] | undefined, readOnly: boolean): string[] {
  const scopes = normalizeScopes(input ?? defaultReadOnlyAdminScopes);
  const writeScopes = scopes.filter((scope) => scope.toLowerCase().startsWith("write_"));
  if (readOnly && writeScopes.length > 0) {
    throw new Error(`write_scopes_blocked: Write scopes require --write-enabled. Only ${implementedWriteExecuteToolsText} are implemented; all other execute tools remain fail-closed placeholders.`);
  }
  return scopes;
}

function setupWarnings(readOnly: boolean, scopes: readonly string[]): SetupWarning[] {
  const warnings: SetupWarning[] = [];
  if (!readOnly) {
    warnings.push({
      code: "write_mode_requested",
      message: `Write mode was requested. Only ${implementedWriteExecuteToolsText} are implemented; all other execute tools remain fail-closed placeholders.`
    });
  }
  if (scopes.some((scope) => scope.toLowerCase().startsWith("write_"))) {
    warnings.push({
      code: "write_scopes_requested",
      message: `Write scopes were requested. Use only the minimal scopes required for reviewed development-store tests of ${implementedWriteExecuteToolsText}.`
    });
  }
  return warnings;
}

function setupNextSteps(authMethod: "manual" | "oauth", configPath: string): string[] {
  const common = [
    `Point your MCP host at the local config path: ${configPath}.`,
    "For the current GitHub-only install, use the generated local node MCP command after pnpm run build.",
    "Users can ask the AI host in ordinary store language; the host should map requests to Shopify Store Agent tools and ask for missing exact targets before calling tools.",
    `Keep read-only mode enabled except for explicit reviewed development-store tests of ${implementedWriteExecuteToolsText}.`
  ];
  if (authMethod === "oauth") {
    return [
      "setup --auth oauth only prepares guidance and snippets; it does not run the OAuth browser flow or exchange a token.",
      "Run shopify-store-agent auth with your own Shopify app client credentials to open the local OAuth browser flow and store the Admin API token locally.",
      "Do not paste OAuth client secrets or generated tokens into docs, PRs, screenshots, logs, or chat.",
      ...common
    ];
  }
  return [
    "Create or use a Shopify custom app token with only the scopes needed for read and preview workflows.",
    ...common
  ];
}

function setupFirstPrompts(): string[] {
  return [
    "Check my Shopify connection and tell me only whether the store is ready. Do not show secrets or raw config.",
    "Create a draft page preview for our return policy. Ask me for any missing content first, and do not execute until I explicitly approve.",
    "I want to update a product. Ask me for the product link, title, Shopify ID, or another exact target if you need it, then show me a preview before any change.",
    "Look up the order or customer I provide and return only a minimal status summary. Do not show raw Shopify data."
  ];
}

async function questionHidden(prompt: string): Promise<string> {
  output.write(prompt);
  if (!input.isTTY || typeof input.setRawMode !== "function") {
    const rl = createInterface({ input, output });
    try {
      return await rl.question("");
    } finally {
      rl.close();
    }
  }

  return new Promise((resolve, reject) => {
    let value = "";
    const wasRaw = input.isRaw;

    const done = (error?: Error) => {
      input.off("data", onData);
      input.setRawMode(Boolean(wasRaw));
      output.write("\n");
      if (error) reject(error);
      else resolve(value);
    };

    const onData = (chunk: Buffer) => {
      for (const char of chunk.toString("utf8")) {
        if (char === "\u0003") return done(new Error("secret_prompt_cancelled"));
        if (char === "\r" || char === "\n") return done();
        if (char === "\u007f" || char === "\b") {
          value = value.slice(0, -1);
          continue;
        }
        if (char >= " ") value += char;
      }
    };

    input.setRawMode(true);
    input.resume();
    input.on("data", onData);
  });
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

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}
