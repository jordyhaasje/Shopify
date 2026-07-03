import { describe, expect, it } from "vitest";
import { mkdtemp, readFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createConfig } from "@shopify-store-agent/core";
import { generateMcpConfigSnippets, runSetup } from "../src/index.js";

describe("setup", () => {
  it("generates snippets without leaking tokens", () => {
    const config = createConfig({
      storeUrl: "demo.myshopify.com",
      adminAccessToken: "secret-token"
    });

    const snippets = generateMcpConfigSnippets(config);
    expect(snippets.codex).toContain("SHOPIFY_STORE_AGENT_STORE");
    expect(snippets.codex).not.toContain("secret-token");
  });

  it("generates Codex, Claude Code, Cursor, and generic MCP snippets without raw secrets", () => {
    const config = createConfig({
      storeUrl: "demo.myshopify.com",
      adminAccessToken: "shpat_snippet_secret",
      themeAccessToken: "theme_snippet_secret"
    });

    const snippets = generateMcpConfigSnippets(config, { configPath: "/tmp/shopify-store-agent/config.json" });
    const output = JSON.stringify(snippets);

    expect(snippets.codex).toContain("[mcp_servers.shopify-store-agent]");
    expect(snippets.claude).toContain("\"mcpServers\"");
    expect(snippets.cursor).toContain("\"mcpServers\"");
    expect(snippets.generic).toContain("\"shopify-store-agent\"");
    expect(output).toContain("SHOPIFY_STORE_AGENT_CONFIG");
    expect(output).not.toContain("shpat_snippet_secret");
    expect(output).not.toContain("theme_snippet_secret");
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
    expect(result.warnings).toEqual([]);
  });

  it("does not activate writes when write preparation is requested", async () => {
    const result = await runSetup({ storeUrl: "demo", readOnly: false, dryRun: true });

    expect(result.config.readOnly).toBe(false);
    expect(result.warnings).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "write_mode_requested" })
    ]));
    expect(JSON.stringify(result)).not.toContain("not_implemented");
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

  it("supports OAuth setup metadata without token or secret leaks", async () => {
    const directory = await mkdtemp(join(tmpdir(), "shopify-store-agent-oauth-"));
    const configPath = join(directory, "config.json");

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
    expect(saved).toContain("client-id-123");
    expect(saved).not.toContain("shpat_should_not_be_used_for_oauth");
    expect(output).not.toContain("shpat_should_not_be_used_for_oauth");
    expect(result.nextSteps.join(" ")).toContain("local OAuth");
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

  it("does not add mutation or Admin write paths to setup output", async () => {
    const result = await runSetup({ storeUrl: "demo", dryRun: true });
    const output = JSON.stringify(result);

    expect(output).not.toContain("mutation");
    expect(output).not.toContain("Admin API write");
    expect(output).not.toContain("productCreate");
  });
});
