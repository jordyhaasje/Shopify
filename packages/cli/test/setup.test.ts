import { describe, expect, it } from "vitest";
import { createHmac } from "node:crypto";
import { createServer } from "node:http";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createConfig } from "@shopify-store-agent/core";
import { generateMcpConfigSnippets, runOAuthInstall, runSetup, runSmokeValidation } from "../src/index.js";

describe("setup", () => {
  it("generates snippets without leaking tokens", () => {
    const config = createConfig({
      storeUrl: "demo.myshopify.com",
      adminAccessToken: "secret-token"
    });

    const snippets = generateMcpConfigSnippets(config);
    expect(snippets.codex).toContain("SHOPIFY_STORE_AGENT_STORE");
    expect(snippets.codex).toContain("command = \"node\"");
    expect(snippets.codex).toContain("packages/mcp/dist/server.js");
    expect(snippets.codex).not.toContain("secret-token");
  });

  it("generates Codex, Claude Code, Cursor, and generic local MCP snippets without raw secrets", () => {
    const config = createConfig({
      storeUrl: "demo.myshopify.com",
      adminAccessToken: "shpat_snippet_secret",
      themeAccessToken: "theme_snippet_secret"
    });

    const localServerPath = "/absolute/path/to/Shopify/packages/mcp/dist/server.js";
    const snippets = generateMcpConfigSnippets(config, {
      configPath: "/tmp/shopify-store-agent/config.json",
      localMcpServerPath: localServerPath
    });
    const output = JSON.stringify(snippets);

    expect(snippets.codex).toContain("[mcp_servers.shopify-store-agent]");
    expect(snippets.codex).toContain("command = \"node\"");
    expect(snippets.codex).toContain(`args = ${JSON.stringify([localServerPath])}`);
    expect(snippets.claude).toContain("\"mcpServers\"");
    expect(snippets.claude).toContain("\"command\": \"node\"");
    expect(snippets.claude).toContain(localServerPath);
    expect(snippets.cursor).toContain("\"mcpServers\"");
    expect(snippets.cursor).toContain("\"command\": \"node\"");
    expect(snippets.cursor).toContain(localServerPath);
    expect(snippets.generic).toContain("\"shopify-store-agent\"");
    expect(snippets.generic).toContain("\"command\": \"node\"");
    expect(snippets.generic).toContain(localServerPath);
    expect(output).toContain("SHOPIFY_STORE_AGENT_CONFIG");
    expect(output).not.toContain("shpat_snippet_secret");
    expect(output).not.toContain("theme_snippet_secret");
    expect(output).not.toContain("client-secret");
  });

  it("keeps the future npx MCP snippet mode explicit", () => {
    const config = createConfig({ storeUrl: "demo.myshopify.com" });

    const snippets = generateMcpConfigSnippets(config, { mcpCommandMode: "npx" });

    expect(snippets.codex).toContain("command = \"npx\"");
    expect(snippets.codex).toContain("shopify-store-agent-mcp");
  });

  it("supports non-interactive dry-run setup", async () => {
    const result = await runSetup({ storeUrl: "demo", dryRun: true });
    expect(result.config.storeUrl).toBe("demo.myshopify.com");
    expect(result.config.capabilities?.adminApi).toBe(false);
  });

  it("validates setup input and normalizes store URLs", async () => {
    await expect(runSetup({ storeUrl: "   ", dryRun: true })).rejects.toThrow("Store URL is required.");

    const result = await runSetup({ storeUrl: "https://demo.myshopify.com/", dryRun: true });

    expect(result.config.storeUrl).toBe("demo.myshopify.com");
  });

  it("defaults setup to read-only and read-oriented scopes", async () => {
    const result = await runSetup({ storeUrl: "demo", dryRun: true });

    expect(result.config.readOnly).toBe(true);
    expect(result.scopeSummary).toContain("read_products");
    expect(result.scopeSummary).not.toContain("write_products");
    expect(result.scopes.every((scope) => scope.startsWith("read_"))).toBe(true);
    expect(result.warnings).toEqual([]);
  });

  it("does not activate writes when write preparation is requested", async () => {
    const result = await runSetup({ storeUrl: "demo", readOnly: false, dryRun: true });

    expect(result.config.readOnly).toBe(false);
    expect(result.warnings).toEqual(expect.arrayContaining([
      expect.objectContaining({
        code: "write_mode_requested",
        message: expect.stringContaining("page.create.execute")
      })
    ]));
    const warningText = JSON.stringify(result.warnings);
    expect(warningText).toContain("product.create.execute");
    expect(warningText).toContain("collection.create.execute");
    expect(warningText).toContain("fail-closed placeholders");
  });

  it("blocks explicit setup write scopes unless write mode is explicitly enabled", async () => {
    await expect(runSetup({
      storeUrl: "demo",
      scopes: "read_products,write_products",
      dryRun: true
    })).rejects.toThrow("write_scopes_blocked");

    const result = await runSetup({
      storeUrl: "demo",
      scopes: "read_products,write_products",
      readOnly: false,
      dryRun: true
    });

    expect(result.warnings).toEqual(expect.arrayContaining([
      expect.objectContaining({
        code: "write_scopes_requested",
        message: expect.stringContaining("minimal scopes")
      })
    ]));
    expect(JSON.stringify(result.warnings)).toContain("page.create.execute");
    expect(JSON.stringify(result.warnings)).toContain("collection.create.execute");
    expect(JSON.stringify(result.warnings)).toContain("product.create.execute");
  });

  it("redacts manual token config in setup output while saving locally", async () => {
    const directory = await mkdtemp(join(tmpdir(), "shopify-store-agent-"));
    const configPath = join(directory, "config.json");

    const result = await runSetup({
      storeUrl: "demo",
      authMethod: "manual",
      adminAccessToken: "shpat_manual_secret",
      configPath,
      saveConfig: true
    });
    const saved = await readFile(configPath, "utf8");
    const output = JSON.stringify({
      safeConfig: result.safeConfig,
      snippets: result.snippets,
      capabilityCheck: result.capabilityCheck,
      warnings: result.warnings
    });

    expect(result.saved).toBe(true);
    expect(saved).toContain("shpat_manual_secret");
    expect(output).not.toContain("shpat_manual_secret");
    expect(result.safeConfig.adminAccessToken).not.toBe("shpat_manual_secret");
  });

  it("keeps OAuth setup as guidance without overwriting token-bearing local config", async () => {
    const directory = await mkdtemp(join(tmpdir(), "shopify-store-agent-oauth-"));
    const configPath = join(directory, "config.json");
    await writeFile(configPath, JSON.stringify({
      storeUrl: "demo.myshopify.com",
      adminAccessToken: "shpat_existing_oauth_secret",
      readOnly: true
    }, null, 2));

    const result = await runSetup({
      storeUrl: "demo",
      authMethod: "oauth",
      clientId: "client-id-123",
      adminAccessToken: "shpat_should_not_be_used_for_oauth",
      configPath,
      saveConfig: true
    });
    const saved = await readFile(configPath, "utf8");
    const output = JSON.stringify(result);

    expect(result.authMethod).toBe("oauth");
    expect(result.saved).toBe(false);
    expect(saved).toContain("shpat_existing_oauth_secret");
    expect(saved).not.toContain("client-id-123");
    expect(saved).not.toContain("shpat_should_not_be_used_for_oauth");
    expect(output).not.toContain("shpat_should_not_be_used_for_oauth");
    expect(output).not.toContain("shpat_existing_oauth_secret");
    expect(result.nextSteps.join(" ")).toContain("setup --auth oauth only prepares guidance and snippets");
    expect(result.nextSteps.join(" ")).toContain("shopify-store-agent auth");
  });

  it("runs capability checks safely without live Shopify calls by default", async () => {
    let fetchCalls = 0;

    const result = await runSetup({
      storeUrl: "demo",
      adminAccessToken: "shpat_capability_secret",
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
    });

    expect(fetchCalls).toBe(0);
    expect(result.capabilityCheck.mode).toBe("local");
    expect(JSON.stringify(result.capabilityCheck)).not.toContain("shpat_capability_secret");
  });

  it("uses a mocked fetcher only for explicit live capability checks", async () => {
    let fetchCalls = 0;

    const result = await runSetup({
      storeUrl: "demo",
      adminAccessToken: "shpat_live_secret",
      liveCapabilityCheck: true,
      fetcher: async () => {
        fetchCalls += 1;
        return {
          ok: true,
          status: 200,
          async text() {
            return JSON.stringify({
              data: {
                shop: {
                  name: "Demo Shop",
                  myshopifyDomain: "demo.myshopify.com",
                  primaryDomain: { host: "example.com" }
                }
              }
            });
          }
        };
      }
    });

    expect(fetchCalls).toBe(1);
    expect(result.capabilityCheck.mode).toBe("live");
    expect(result.capabilityCheck.live).toMatchObject({ attempted: true, ok: true });
    expect(JSON.stringify(result)).not.toContain("shpat_live_secret");
  });

  it("defaults OAuth install to read-only scopes and no write scopes in the install URL", async () => {
    const port = await unusedPort();
    const logs: string[] = [];
    const originalLog = console.log;
    console.log = (...values: unknown[]) => {
      logs.push(values.map(String).join(" "));
    };
    try {
      const directory = await mkdtemp(join(tmpdir(), "shopify-store-agent-oauth-install-"));
      const configPath = join(directory, "config.json");
      const install = runOAuthInstall({
        storeUrl: "demo",
        clientId: "client-id-123",
        clientSecret: "client-secret-123",
        redirectPort: port,
        configPath,
        tokenFetcher: async () => ({
          ok: true,
          status: 200,
          async text() {
            return JSON.stringify({
              access_token: "shpat_oauth_secret",
              scope: "read_products,read_orders,read_customers"
            });
          }
        })
      });

      const installUrl = await waitForInstallUrl(logs);
      const scopes = installUrl.searchParams.get("scope") ?? "";
      expect(scopes).toContain("read_products");
      expect(scopes).not.toContain("write_");

      const state = installUrl.searchParams.get("state") ?? "";
      await fetch(`http://127.0.0.1:${port}/auth/callback?${signedOAuthCallback({
        code: "code-123",
        shop: "demo.myshopify.com",
        state,
        timestamp: "123"
      }, "client-secret-123")}`);
      const result = await install;
      const output = logs.join("\n");

      expect(result.grantedScopes).toEqual(["read_products", "read_orders", "read_customers"]);
      expect(output).not.toContain("write_");
      expect(output).not.toContain("client-secret-123");
      expect(output).not.toContain("shpat_oauth_secret");
    } finally {
      console.log = originalLog;
    }
  });

  it("blocks explicit OAuth write scopes unless write mode is explicitly enabled", async () => {
    await expect(runOAuthInstall({
      storeUrl: "demo",
      clientId: "client-id-123",
      clientSecret: "client-secret-123",
      scopes: "read_products,write_products",
      redirectPort: await unusedPort()
    })).rejects.toThrow("write_scopes_blocked");
  });

  it("does not add mutation or Admin write paths to setup output", async () => {
    const result = await runSetup({ storeUrl: "demo", dryRun: true });
    const output = JSON.stringify(result);

    expect(output).not.toContain("mutation");
    expect(output).not.toContain("Admin API write");
    expect(output).not.toContain("productCreate");
  });

  it("runs smoke validation local-only by default without fetch calls or secret leaks", async () => {
    let fetchCalls = 0;

    const result = await runSmokeValidation({
      storeUrl: "demo",
      adminAccessToken: "shpat_smoke_secret",
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
    });
    const output = JSON.stringify(result);

    expect(result).toMatchObject({
      ok: true,
      mode: "local",
      readOnly: true,
      fetchCalls: 0,
      execute: {
        invalidStatus: "blocked",
        invalidAuditResult: "blocked",
        validStatus: "not_implemented",
        validAuditResult: "not_implemented",
        anySuccessAudit: false
      }
    });
    expect(result.checks).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: "preview_store_record", ok: true }),
      expect.objectContaining({ name: "invalid_execute_blocked", ok: true }),
      expect.objectContaining({ name: "valid_execute_not_implemented", ok: true })
    ]));
    expect(fetchCalls).toBe(0);
    expect(output).not.toContain("shpat_smoke_secret");
    expect(result.snippets.codex).toContain("command = \"node\"");
    expect(JSON.parse(result.snippets.generic)).toMatchObject({ command: "node" });
    expect(output).not.toContain("shopify-store-agent-mcp");
    expect(output).not.toContain("mutation");
    expect(output).not.toContain("Admin API write");
    expect(output).not.toContain("productCreate");
  });

  it("uses mocked capability check only when smoke live mode is explicit", async () => {
    let fetchCalls = 0;

    const result = await runSmokeValidation({
      storeUrl: "demo",
      live: true,
      adminAccessToken: "shpat_smoke_live_secret",
      fetcher: async () => {
        fetchCalls += 1;
        return {
          ok: true,
          status: 200,
          async text() {
            return JSON.stringify({
              data: {
                shop: {
                  name: "Demo Shop",
                  myshopifyDomain: "demo.myshopify.com",
                  primaryDomain: { host: "example.com" }
                }
              }
            });
          }
        };
      }
    });

    expect(fetchCalls).toBe(1);
    expect(result.mode).toBe("live");
    expect(result.capabilityCheck.live).toMatchObject({ attempted: true, ok: true });
    expect(JSON.stringify(result)).not.toContain("shpat_smoke_live_secret");
  });

  it("keeps dev-store validation checklist documented", async () => {
    const checklist = await readFile("docs/dev-store-validation.md", "utf8");

    expect(checklist).toContain("read-only");
    expect(checklist).toContain("smoke");
    expect(checklist).toContain("execute placeholder");
    expect(checklist).toContain("no writes");
    expect(checklist).not.toContain("shpat_");
  });
});

function signedOAuthCallback(params: Record<string, string>, clientSecret: string): string {
  const message = Object.entries(params)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => `${key}=${value}`)
    .join("&");
  const hmac = createHmac("sha256", clientSecret).update(message).digest("hex");
  return new URLSearchParams({ ...params, hmac }).toString();
}

async function waitForInstallUrl(logs: string[]): Promise<URL> {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    const value = logs.find((entry) => entry.startsWith("https://"));
    if (value) return new URL(value);
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error("OAuth install URL was not logged.");
}

async function unusedPort(): Promise<number> {
  return await new Promise((resolve, reject) => {
    const server = createServer();
    server.on("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        server.close();
        reject(new Error("No TCP port allocated."));
        return;
      }
      const port = address.port;
      server.close(() => resolve(port));
    });
  });
}
