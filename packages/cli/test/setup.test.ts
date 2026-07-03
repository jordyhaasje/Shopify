import { describe, expect, it } from "vitest";
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

  it("supports non-interactive dry-run setup", async () => {
    const result = await runSetup({ storeUrl: "demo", dryRun: true });
    expect(result.config.storeUrl).toBe("demo.myshopify.com");
    expect(result.config.capabilities?.adminApi).toBe(false);
  });
});
