import { describe, expect, it } from "vitest";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createConfig, hashPreviewContent, reviewedPayloadForPreviewRecord } from "@shopify-store-agent/core";
import { callTool, createDefaultContext, listTools, type ToolContext } from "../src/tools.js";
import { MemoryAuditLog } from "@shopify-store-agent/core";

const expectedToolNames = [
  "shopify.capabilities.check",
  "product.create.preview",
  "product.create.execute",
  "product.update.preview",
  "product.update.execute",
  "product.media.update.preview",
  "product.media.update.execute",
  "product.importFromUserUrl.preview",
  "product.importFromUserUrl.execute",
  "product.get",
  "order.find",
  "order.get",
  "customer.find",
  "customer.updateAddress.preview",
  "customer.updateAddress.execute",
  "refund.preview",
  "refund.execute",
  "tracking.get",
  "tracking.update.preview",
  "tracking.update.execute",
  "page.create.preview",
  "page.create.execute",
  "collection.create.preview",
  "collection.create.execute",
  "bulk.preview",
  "bulk.execute",
  "bulk.status",
  "theme.reference.analyze",
  "theme.section.generate",
  "theme.preview",
  "theme.apply",
  "theme.rollback"
];

describe("MCP tools", () => {
  it("lists the final v1 contract tool names", () => {
    const names = listTools().map((tool) => tool.name);

    expect(names).toEqual(expectedToolNames);
  });

  it("does not expose legacy placeholder aliases", async () => {
    const names = listTools().map((tool) => tool.name);

    expect(names).not.toContain("product.create");
    expect(names).not.toContain("product.update");
    expect(names).not.toContain("order.lookup");
    expect(names).not.toContain("tracking.update");
    expect(names).not.toContain("theme.analyzeReference");
    expect(names).not.toContain("theme.generateSection");
    await expect(callTool("product.create", {})).rejects.toThrow("Unknown tool");
  });

  it("returns safe local capability diagnostics without exposing secrets", async () => {
    const context: ToolContext = {
      config: createConfig({
        storeUrl: "demo",
        adminAccessToken: "shpat_test_secret",
        themeAccessToken: "theme_test_secret"
      }),
      audit: new MemoryAuditLog()
    };

    const result = await callTool("shopify.capabilities.check", {}, context);

    expect(result).toMatchObject({
      ok: true,
      mode: "read",
      diagnostics: {
        mode: "local",
        store: {
          adminApiTokenConfigured: true,
          themeAccessTokenConfigured: true
        }
      }
    });
    expect(JSON.stringify(result)).not.toContain("shpat_test_secret");
    expect(JSON.stringify(result)).not.toContain("theme_test_secret");
    expect(context.audit.list()[0]).toMatchObject({
      tool: "shopify.capabilities.check",
      mode: "read",
      result: "success"
    });
  });

  it("uses mocked fetch for live capability diagnostics only", async () => {
    const context: ToolContext = {
      config: createConfig({
        storeUrl: "demo",
        adminAccessToken: "token"
      }),
      audit: new MemoryAuditLog(),
      fetcher: async () => ({
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
      })
    };

    const result = await callTool("shopify.capabilities.check", { live: true }, context);

    expect(result).toMatchObject({
      ok: true,
      diagnostics: {
        mode: "live",
        live: {
          attempted: true,
          ok: true
        }
      }
    });
  });

  it("runs order.find as a real read tool with audit", async () => {
    const context = readContext({
      data: {
        orders: {
          nodes: [{
            id: "gid://shopify/Order/1",
            name: "#1001",
            customer: { id: "gid://shopify/Customer/1", displayName: "Customer One", email: "customer@example.com" },
            fulfillments: []
          }]
        }
      }
    });

    const result = await callTool("order.find", { orderNumber: "1001" }, context);

    expect(result).toMatchObject({
      ok: true,
      mode: "read",
      result: {
        status: "ok",
        matches: [{ id: "gid://shopify/Order/1", name: "#1001" }]
      }
    });
    expect(context.audit.list()[0]).toMatchObject({ tool: "order.find", mode: "read", result: "success" });
    expect(JSON.stringify(result)).not.toContain("rawNodeOnly");
  });

  it("returns a clear missing input diagnostic for read tools", async () => {
    const context = readContext({ data: { orders: { nodes: [] } } });

    const result = await callTool("order.find", {}, context);

    expect(result).toMatchObject({
      ok: false,
      result: {
        ok: false,
        status: "missing_input",
        diagnostics: [{ code: "missing_input" }]
      }
    });
    expect(context.audit.list()[0]).toMatchObject({ tool: "order.find", mode: "read", result: "blocked" });
  });

  it("records failed audit for Shopify read errors", async () => {
    const context = readContext({
      errors: [{ message: "Access denied for orders", extensions: { code: "ACCESS_DENIED" } }]
    });

    const result = await callTool("order.get", { orderId: "gid://shopify/Order/1" }, context);

    expect(result).toMatchObject({
      ok: false,
      mode: "read",
      result: {
        ok: false,
        status: "shopify_error",
        diagnostics: [{ code: "access_denied" }]
      }
    });
    expect(context.audit.list()[0]).toMatchObject({ tool: "order.get", mode: "read", result: "failed" });
  });

  it("runs product.get as a real read tool", async () => {
    const context = readContext({
      data: {
        productByHandle: {
          id: "gid://shopify/Product/1",
          title: "Shirt",
          handle: "shirt",
          status: "ACTIVE",
          rawNodeOnly: true
        }
      }
    });

    const result = await callTool("product.get", { handle: "shirt" }, context);

    expect(result).toMatchObject({
      ok: true,
      mode: "read",
      result: {
        item: {
          id: "gid://shopify/Product/1",
          title: "Shirt",
          handle: "shirt"
        }
      }
    });
    expect(JSON.stringify(result)).not.toContain("rawNodeOnly");
  });

  it("runs catalog and content previews with structured audit entries", async () => {
    const context = baseContext();

    const result = await callTool("product.create.preview", {
      title: "Linen Shirt",
      description: "A light linen shirt.",
      variants: [{ sku: "LINEN-S", price: "29.00" }],
      media: [{ url: "https://example.com/shirt.jpg", alt: "Linen shirt" }]
    }, context);

    expect(result).toMatchObject({
      ok: true,
      mode: "preview",
      status: "ok",
      previewHash: expect.stringMatching(/^sha256:/),
      binding: {
        previewId: expect.any(String),
        expectedTool: "product.create.preview",
        target: "Linen Shirt",
        previewHash: expect.stringMatching(/^sha256:/),
        expiresAt: expect.any(String)
      },
      executeRequest: {
        tool: "product.create.execute",
        requiresConfirmation: true,
        confirmationField: "confirmed",
        confirmValue: true,
        previewId: expect.any(String),
        expectedTool: "product.create.preview",
        target: "Linen Shirt",
        previewHash: expect.stringMatching(/^sha256:/),
        reviewedPayload: expect.objectContaining({
          tool: "product.create.preview",
          target: expect.any(Object),
          proposedChanges: expect.any(Object)
        }),
        reviewedChangesHash: expect.stringMatching(/^sha256:/),
        instructions: expect.stringContaining("explicit user approval")
      },
      target: { type: "product", title: "Linen Shirt" },
      auditContext: {
        tool: "product.create.preview",
        performsShopifyMutation: false,
        usesShopifyWriteOperation: false
      },
      audit: {
        tool: "product.create.preview",
        mode: "preview",
        result: "success"
      }
    });
    expect(context.audit.list()[0]).toMatchObject({
      tool: "product.create.preview",
      mode: "preview",
      result: "success"
    });
    const executeRequest = (result as { executeRequest: Record<string, unknown> }).executeRequest;
    expect(executeRequest.previewId).toBe((result as { previewId: string }).previewId);
    expect(executeRequest.previewHash).toBe((result as { previewHash: string }).previewHash);
    expect(executeRequest.reviewedChangesHash).toBe((result as { previewHash: string }).previewHash);
    expect(context.previewStore?.getPreview((result as { previewId: string }).previewId)).toMatchObject({
      ok: true,
      record: {
        tool: "product.create.preview",
        previewHash: (result as { previewHash: string }).previewHash
      }
    });
  });

  it("adds a page create execute helper without weakening confirmation", async () => {
    let fetchCalled = false;
    const context = baseContext(async () => {
      fetchCalled = true;
      return jsonResponse({});
    }, false);

    const preview = await callTool("page.create.preview", {
      title: "Care Guide",
      body: "Wash cold and hang dry.",
      handle: "care-guide"
    }, context) as Record<string, unknown>;
    const executeRequest = preview.executeRequest as Record<string, unknown>;

    expect(executeRequest).toMatchObject({
      tool: "page.create.execute",
      requiresConfirmation: true,
      confirmationField: "confirmed",
      confirmValue: true,
      previewId: preview.previewId,
      expectedTool: "page.create.preview",
      target: "care-guide",
      previewHash: preview.previewHash,
      reviewedPayload: expect.objectContaining({
        tool: "page.create.preview",
        target: expect.any(Object),
        proposedChanges: expect.any(Object)
      }),
      reviewedChangesHash: preview.previewHash
    });

    const blocked = await callTool("page.create.execute", { ...executeRequest }, context);

    expect(blocked).toMatchObject({
      ok: false,
      mode: "execute",
      implemented: true,
      status: "blocked",
      diagnostics: expect.arrayContaining([
        expect.objectContaining({ code: "missing_confirmation" })
      ])
    });
    expect(fetchCalled).toBe(false);
  });

  it("uses unique stored preview IDs for identical MCP preview events", async () => {
    const context = baseContext();
    const input = {
      title: "Repeat Page",
      body: "Reviewed page body."
    };

    const first = await callTool("page.create.preview", input, context) as Record<string, unknown>;
    const second = await callTool("page.create.preview", input, context) as Record<string, unknown>;

    expect(first.previewId).not.toBe(second.previewId);
    expect(first.previewHash).toBe(second.previewHash);
    expect(context.previewStore?.getPreview(first.previewId)).toMatchObject({ ok: true });
    expect(context.previewStore?.getPreview(second.previewId)).toMatchObject({ ok: true });
  });

  it("persists default-context preview records across MCP context restarts", async () => {
    const dir = mkdtempSync(join(tmpdir(), "shopify-mcp-preview-store-"));
    const oldPreviewStore = process.env.SHOPIFY_STORE_AGENT_PREVIEW_STORE;
    const oldConfig = process.env.SHOPIFY_STORE_AGENT_CONFIG;
    const oldStore = process.env.SHOPIFY_STORE_AGENT_STORE;
    try {
      process.env.SHOPIFY_STORE_AGENT_PREVIEW_STORE = join(dir, "previews.json");
      process.env.SHOPIFY_STORE_AGENT_CONFIG = join(dir, "missing-config.json");
      process.env.SHOPIFY_STORE_AGENT_STORE = "preview-store-test.myshopify.com";

      const firstContext = await createDefaultContext();
      const preview = await callTool("product.create.preview", { title: "Persistent Preview Product" }, firstContext) as Record<string, unknown>;

      const secondContext = await createDefaultContext();

      expect(secondContext.previewStore?.getPreview(preview.previewId)).toMatchObject({
        ok: true,
        status: "active",
        record: {
          previewId: preview.previewId,
          previewHash: preview.previewHash,
          tool: "product.create.preview"
        }
      });
    } finally {
      restoreEnv("SHOPIFY_STORE_AGENT_PREVIEW_STORE", oldPreviewStore);
      restoreEnv("SHOPIFY_STORE_AGENT_CONFIG", oldConfig);
      restoreEnv("SHOPIFY_STORE_AGENT_STORE", oldStore);
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("persists default-context audit entries across MCP context restarts", async () => {
    const dir = mkdtempSync(join(tmpdir(), "shopify-mcp-audit-log-"));
    const auditPath = join(dir, "audit.jsonl");
    const oldAuditLog = process.env.SHOPIFY_STORE_AGENT_AUDIT_LOG;
    const oldConfig = process.env.SHOPIFY_STORE_AGENT_CONFIG;
    const oldStore = process.env.SHOPIFY_STORE_AGENT_STORE;
    try {
      process.env.SHOPIFY_STORE_AGENT_AUDIT_LOG = auditPath;
      process.env.SHOPIFY_STORE_AGENT_CONFIG = join(dir, "missing-config.json");
      process.env.SHOPIFY_STORE_AGENT_STORE = "audit-log-test.myshopify.com";

      const firstContext = await createDefaultContext();
      const result = await callTool("shopify.capabilities.check", {}, firstContext) as Record<string, unknown>;

      const secondContext = await createDefaultContext();

      expect(result.audit).toMatchObject({
        tool: "shopify.capabilities.check",
        target: "audit-log-test.myshopify.com",
        mode: "read",
        result: "success"
      });
      expect(secondContext.audit.list()).toMatchObject([{
        tool: "shopify.capabilities.check",
        target: "audit-log-test.myshopify.com",
        mode: "read",
        result: "success"
      }]);
      expect(readFileSync(auditPath, "utf8")).not.toContain("shpat_");
    } finally {
      restoreEnv("SHOPIFY_STORE_AGENT_AUDIT_LOG", oldAuditLog);
      restoreEnv("SHOPIFY_STORE_AGENT_CONFIG", oldConfig);
      restoreEnv("SHOPIFY_STORE_AGENT_STORE", oldStore);
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("records blocked audit entries for missing or invalid preview input", async () => {
    const context = baseContext();

    const missing = await callTool("product.create.preview", {}, context);
    const invalid = await callTool("product.create.preview", { title: "Bad Status", status: "VISIBLE" }, context);

    expect(missing).toMatchObject({
      ok: false,
      mode: "preview",
      status: "missing_input"
    });
    expect(invalid).toMatchObject({
      ok: false,
      mode: "preview",
      status: "validation_error"
    });
    expect((missing as Record<string, unknown>).executeRequest).toBeUndefined();
    expect((invalid as Record<string, unknown>).executeRequest).toBeUndefined();
    expect(context.audit.list()).toEqual([
      expect.objectContaining({ tool: "product.create.preview", result: "blocked" }),
      expect.objectContaining({ tool: "product.create.preview", result: "blocked" })
    ]);
  });

  it("does not call fetchers or Shopify mutations for preview tools", async () => {
    let fetchCalled = false;
    const context = baseContext(async () => {
      fetchCalled = true;
      return {
        ok: true,
        status: 200,
        async text() {
          return "{}";
        }
      };
    });
    const previewCalls: Array<[string, Record<string, unknown>]> = [
      ["product.create.preview", { title: "Linen Shirt" }],
      ["product.update.preview", { productId: "gid://shopify/Product/1", changes: { title: "New Shirt" } }],
      ["product.media.update.preview", { productId: "gid://shopify/Product/1", media: [{ url: "https://example.com/new.jpg" }] }],
      ["product.importFromUserUrl.preview", { url: "https://example.com/products/shirt", instructions: "Rewrite copy only." }],
      ["page.create.preview", { title: "Care Guide", body: "Wash cold." }],
      ["collection.create.preview", { title: "Summer", productIds: ["gid://shopify/Product/1"] }]
    ];

    for (const [tool, input] of previewCalls) {
      const result = await callTool(tool, input, context);
      expect(result).toMatchObject({
        ok: true,
        mode: "preview",
        auditContext: {
          performsShopifyMutation: false,
          usesShopifyWriteOperation: false
        }
      });
      if (tool !== "product.create.preview" && tool !== "page.create.preview" && tool !== "collection.create.preview") {
        expect((result as Record<string, unknown>).executeRequest).toBeUndefined();
      }
    }

    expect(fetchCalled).toBe(false);
  });

  it("keeps preview output free of secrets and raw oversized payload dumps", async () => {
    const context = baseContext();
    const result = await callTool("page.create.preview", {
      title: "Large Page",
      body: `shpat_test_secret ${"Long content ".repeat(1000)}`,
      seo: { token: "shpat_test_secret" },
      rawNodeOnly: { id: "gid://shopify/Page/1", token: "shpat_test_secret" }
    }, context);
    const output = JSON.stringify(result);

    expect(result).toMatchObject({ ok: true, mode: "preview", status: "ok" });
    expect(output).not.toContain("shpat_test_secret");
    expect(output).not.toContain("rawNodeOnly");
    expect(output.length).toBeLessThan(6000);
    expect(output).toContain("[redacted]");
  });

  it("redacts URL secrets from preview output and audit target", async () => {
    const context = baseContext();
    const result = await callTool("product.importFromUserUrl.preview", {
      url: "https://user:pass@example.com/products/shirt?access_token=shpat_url_secret&color=blue&ref=shpua_ref_secret&key=plain-secret",
      instructions: "Rewrite only from public rendered-page signals."
    }, context);
    const output = JSON.stringify(result);
    const [audit] = context.audit.list();

    expect(result).toMatchObject({ ok: true, mode: "preview", status: "ok" });
    expect(output).not.toContain("shpat_url_secret");
    expect(output).not.toContain("shpua_ref_secret");
    expect(output).not.toContain("plain-secret");
    expect(output).not.toContain("user:pass");
    expect(audit.target).not.toContain("shpat_url_secret");
    expect(audit.target).not.toContain("shpua_ref_secret");
    expect(audit.target).not.toContain("plain-secret");
    expect(audit).toMatchObject({
      tool: "product.importFromUserUrl.preview",
      mode: "preview",
      result: "success"
    });
  });

  it("uses supplied existingProduct before-values without fetching", async () => {
    let fetchCalled = false;
    const context = baseContext(async () => {
      fetchCalled = true;
      return jsonResponse({});
    });

    const result = await callTool("product.update.preview", {
      productId: "gid://shopify/Product/1",
      enrichExistingProduct: true,
      existingProduct: { title: "Old Shirt", vendor: "Old Vendor" },
      changes: { title: "New Shirt", vendor: "New Vendor" }
    }, context);

    expect(result).toMatchObject({ ok: true, mode: "preview", status: "ok" });
    expect(changeFor(result, "title")).toMatchObject({ before: "Old Shirt", after: "New Shirt" });
    expect(changeFor(result, "vendor")).toMatchObject({ before: "Old Vendor", after: "New Vendor" });
    expect(fetchCalled).toBe(false);
  });

  it("uses supplied existingProductSummary before-values without fetching", async () => {
    let fetchCalled = false;
    const context = baseContext(async () => {
      fetchCalled = true;
      return jsonResponse({});
    });

    const result = await callTool("product.update.preview", {
      handle: "linen-shirt",
      enrichExistingProduct: true,
      existingProductSummary: { title: "Old Shirt", status: "DRAFT" },
      changes: { title: "New Shirt", status: "ACTIVE" }
    }, context);

    expect(result).toMatchObject({ ok: true, mode: "preview", status: "ok" });
    expect(changeFor(result, "title")).toMatchObject({ before: "Old Shirt", after: "New Shirt" });
    expect(changeFor(result, "status")).toMatchObject({ before: "DRAFT", after: "ACTIVE" });
    expect(fetchCalled).toBe(false);
  });

  it("enriches product.update.preview by explicit productId with read-only product summary", async () => {
    const requests: Array<{ url: string; body: string }> = [];
    const context = baseContext(async (url, init) => {
      requests.push({ url, body: init.body });
      return jsonResponse({
        data: {
          node: {
            __typename: "Product",
            id: "gid://shopify/Product/1",
            title: "Old Shirt",
            handle: "linen-shirt",
            status: "DRAFT",
            vendor: "Old Vendor",
            productType: "Shirts",
            rawNodeOnly: true,
            variants: { nodes: [{ sku: "RAW" }] }
          }
        }
      });
    });

    const result = await callTool("product.update.preview", {
      productId: "gid://shopify/Product/1",
      enrichExistingProduct: true,
      changes: { title: "New Shirt", vendor: "New Vendor" }
    }, context);
    const output = JSON.stringify(result);

    expect(result).toMatchObject({ ok: true, mode: "preview", status: "ok" });
    expect(changeFor(result, "title")).toMatchObject({ before: "Old Shirt", after: "New Shirt" });
    expect(changeFor(result, "vendor")).toMatchObject({ before: "Old Vendor", after: "New Vendor" });
    expect(requests).toHaveLength(1);
    expect(requests[0].body).not.toContain("mutation");
    expect(requests[0].body).toContain("gid://shopify/Product/1");
    expect(output).not.toContain("rawNodeOnly");
    expect(output).not.toContain("variants");
  });

  it("enriches product.update.preview by explicit handle only", async () => {
    const requests: Array<{ body: string }> = [];
    const context = baseContext(async (_url, init) => {
      requests.push({ body: init.body });
      return jsonResponse({
        data: {
          productByHandle: {
            id: "gid://shopify/Product/2",
            title: "Old Handle Shirt",
            handle: "handle-shirt",
            status: "ACTIVE",
            vendor: "Handle Vendor",
            productType: "Shirts"
          }
        }
      });
    });

    const result = await callTool("product.update.preview", {
      handle: "handle-shirt",
      enrichExistingProduct: true,
      changes: { title: "New Handle Shirt" }
    }, context);

    expect(result).toMatchObject({ ok: true, mode: "preview", status: "ok" });
    expect(changeFor(result, "title")).toMatchObject({ before: "Old Handle Shirt", after: "New Handle Shirt" });
    expect(requests).toHaveLength(1);
    expect(requests[0].body).not.toContain("mutation");
    expect(requests[0].body).toContain("\"handle\":\"handle-shirt\"");
    expect(JSON.parse(requests[0].body).variables).toEqual({ handle: "handle-shirt" });
  });

  it("keeps preview successful with a warning when read enrichment fails", async () => {
    const context = baseContext(async () => jsonResponse({
      errors: [{ message: "Access denied for products", extensions: { code: "ACCESS_DENIED" } }]
    }));

    const result = await callTool("product.update.preview", {
      productId: "gid://shopify/Product/1",
      enrichExistingProduct: true,
      changes: { title: "New Shirt" }
    }, context);

    expect(result).toMatchObject({
      ok: true,
      mode: "preview",
      status: "ok",
      warnings: expect.arrayContaining([
        expect.objectContaining({ code: "read_enrichment_unavailable" })
      ])
    });
    expect(changeFor(result, "title")).toMatchObject({ before: "unknown", after: "New Shirt" });
    expect(context.audit.list()[0]).toMatchObject({
      tool: "product.update.preview",
      mode: "preview",
      result: "success"
    });
  });

  it("keeps preview successful with a sanitized warning when read enrichment throws", async () => {
    const context = baseContext(async () => {
      throw new Error("network failed with token shpat_thrown_secret");
    });

    const result = await callTool("product.update.preview", {
      productId: "gid://shopify/Product/1",
      enrichExistingProduct: true,
      changes: { title: "New Shirt" }
    }, context);
    const output = JSON.stringify(result);

    expect(result).toMatchObject({
      ok: true,
      mode: "preview",
      status: "ok",
      warnings: expect.arrayContaining([
        {
          code: "read_enrichment_unavailable",
          message: "Read-only product enrichment was unavailable; before values remain unknown."
        }
      ])
    });
    expect(changeFor(result, "title")).toMatchObject({ before: "unknown", after: "New Shirt" });
    expect(output).not.toContain("shpat_thrown_secret");
    expect(context.audit.list()[0]).toMatchObject({
      tool: "product.update.preview",
      mode: "preview",
      result: "success"
    });
  });

  it("redacts read-enriched secret-looking values from preview output and audit", async () => {
    const context = baseContext(async () => jsonResponse({
      data: {
        node: {
          __typename: "Product",
          id: "gid://shopify/Product/1",
          title: "Old shpat_read_secret",
          handle: "secret-shirt",
          vendor: "Vendor shpua_read_secret"
        }
      }
    }));

    const result = await callTool("product.update.preview", {
      productId: "gid://shopify/Product/1",
      enrichExistingProduct: true,
      changes: { title: "New Shirt", vendor: "New Vendor" }
    }, context);
    const output = JSON.stringify(result);

    expect(result).toMatchObject({ ok: true, mode: "preview", status: "ok" });
    expect(output).not.toContain("shpat_read_secret");
    expect(output).not.toContain("shpua_read_secret");
    expect(context.audit.list()[0].target).not.toContain("shpat_read_secret");
    expect(context.audit.list()[0].target).not.toContain("shpua_read_secret");
  });

  it("blocks theme apply without confirmation", async () => {
    const context: ToolContext = {
      config: createConfig({ storeUrl: "demo", readOnly: false }),
      audit: new MemoryAuditLog()
    };

    const result = await callTool("theme.apply", { previewId: "preview-1" }, context);

    expect(result).toMatchObject({
      ok: false,
      mode: "execute",
      implemented: false,
      status: "blocked",
      diagnostics: expect.arrayContaining([
        expect.objectContaining({ code: "missing_confirmation" }),
        expect.objectContaining({ code: "missing_reviewed_payload" })
      ])
    });
    expect(context.audit.list()[0]).toMatchObject({
      tool: "theme.apply",
      mode: "execute",
      result: "blocked"
    });
  });

  it("blocks product.create.execute in read-only mode before fetch", async () => {
    let fetchCalled = false;
    const context = baseContext(async () => {
      fetchCalled = true;
      return jsonResponse({});
    });
    const preview = await callTool("product.create.preview", {
      title: "Test product",
      description: "A reviewed product."
    }, context) as Record<string, unknown>;
    const binding = preview.binding as Record<string, unknown>;
    const reviewed = reviewedBindingFor(context, preview);

    const result = await callTool("product.create.execute", {
      previewId: preview.previewId,
      confirmed: true,
      reviewedPayload: reviewed.reviewedPayload,
      expectedTool: binding.expectedTool,
      target: binding.target,
      previewHash: preview.previewHash,
      reviewedChangesHash: reviewed.reviewedChangesHash
    }, context);

    expect(result).toMatchObject({
      ok: false,
      mode: "execute",
      implemented: true,
      status: "blocked",
      diagnostics: expect.arrayContaining([expect.objectContaining({ code: "read_only" })])
    });
    expect(context.audit.list()[1]).toMatchObject({ tool: "product.create.execute", result: "blocked" });
    expect(fetchCalled).toBe(false);
  });

  it("blocks product.create.execute without explicit confirmation before fetch", async () => {
    let fetchCalled = false;
    const context = baseContext(async () => {
      fetchCalled = true;
      return jsonResponse({});
    }, false);
    const preview = await callTool("product.create.preview", {
      title: "Test product",
      description: "A reviewed product."
    }, context) as Record<string, unknown>;
    const binding = preview.binding as Record<string, unknown>;
    const reviewed = reviewedBindingFor(context, preview);

    const result = await callTool("product.create.execute", {
      previewId: preview.previewId,
      reviewedPayload: reviewed.reviewedPayload,
      expectedTool: binding.expectedTool,
      target: binding.target,
      previewHash: preview.previewHash,
      reviewedChangesHash: reviewed.reviewedChangesHash
    }, context);

    expect(result).toMatchObject({
      ok: false,
      mode: "execute",
      implemented: true,
      status: "blocked",
      diagnostics: expect.arrayContaining([
        expect.objectContaining({ code: "missing_confirmation" })
      ])
    });
    expect(context.audit.list()[1]).toMatchObject({
      tool: "product.create.execute",
      mode: "execute",
      result: "blocked"
    });
    expect(fetchCalled).toBe(false);
  });

  it("blocks product.create.execute without stored preview before fetch", async () => {
    let fetchCalled = false;
    const context: ToolContext = {
      config: createConfig({ storeUrl: "demo", adminAccessToken: "shpat_test_secret", readOnly: false }),
      audit: new MemoryAuditLog(),
      fetcher: async () => {
        fetchCalled = true;
        return jsonResponse({});
      }
    };

    const result = await callTool("product.create.execute", {
      previewId: "preview_missing",
      confirmed: true,
      reviewedPayload: { title: "Test product" },
      expectedTool: "product.create.preview",
      target: "Test product",
      previewHash: "sha256:missing",
      reviewedChangesHash: "sha256:missing",
      title: "Test product"
    }, context);

    expect(result).toMatchObject({
      ok: false,
      mode: "execute",
      implemented: true,
      status: "blocked",
      diagnostics: expect.arrayContaining([
        expect.objectContaining({ code: "stored_preview_missing" })
      ])
    });
    expect(context.audit.list()[0]).toMatchObject({ result: "blocked" });
    expect(fetchCalled).toBe(false);
  });

  it("blocks product.update.execute with confirmation but missing reviewed payload", async () => {
    let fetchCalled = false;
    const context = baseContext(async () => {
      fetchCalled = true;
      return jsonResponse({});
    }, false);
    const preview = await callTool("product.update.preview", {
      productId: "gid://shopify/Product/1",
      title: "Updated Shirt"
    }, context) as Record<string, unknown>;
    const binding = preview.binding as Record<string, unknown>;

    const result = await callTool("product.update.execute", {
      confirmed: true,
      previewId: preview.previewId,
      expectedTool: binding.expectedTool,
      target: binding.target,
      previewHash: preview.previewHash,
      reviewedChangesHash: preview.previewHash
    }, context);

    expect(result).toMatchObject({
      ok: false,
      mode: "execute",
      implemented: true,
      status: "blocked",
      diagnostics: expect.arrayContaining([
        expect.objectContaining({ code: "missing_reviewed_payload" })
      ])
    });
    expect(context.audit.list()[1]).toMatchObject({ tool: "product.update.execute", result: "blocked" });
    expect(fetchCalled).toBe(false);
  });

  it("blocks product.create.execute with previewId, confirmation, and payload but missing binding context", async () => {
    const context: ToolContext = {
      config: createConfig({ storeUrl: "demo", readOnly: false }),
      audit: new MemoryAuditLog()
    };

    const result = await callTool("product.create.execute", {
      previewId: "preview_123",
      confirmed: true,
      reviewedPayload: { title: "Test product" },
      title: "Test product"
    }, context);

    expect(result).toMatchObject({
      ok: false,
      mode: "execute",
      implemented: true,
      status: "blocked",
      diagnostics: expect.arrayContaining([
        expect.objectContaining({ code: "stored_preview_missing" })
      ])
    });
    expect(context.audit.list()[0]).toMatchObject({
      tool: "product.create.execute",
      mode: "execute",
      result: "blocked"
    });
  });

  it("blocks product.update.execute when preview binding expected tool mismatches", async () => {
    let fetchCalled = false;
    const context = baseContext(async () => {
      fetchCalled = true;
      return jsonResponse({});
    }, false);
    const preview = await callTool("product.update.preview", {
      productId: "gid://shopify/Product/1",
      title: "Updated Shirt"
    }, context) as Record<string, unknown>;
    const binding = preview.binding as Record<string, unknown>;
    const reviewed = reviewedBindingFor(context, preview);

    const result = await callTool("product.update.execute", {
      previewId: preview.previewId,
      confirmed: true,
      reviewedPayload: reviewed.reviewedPayload,
      expectedTool: "product.create.preview",
      target: binding.target,
      previewHash: preview.previewHash,
      reviewedChangesHash: reviewed.reviewedChangesHash
    }, context);

    expect(result).toMatchObject({
      ok: false,
      mode: "execute",
      implemented: true,
      status: "blocked",
      diagnostics: expect.arrayContaining([
        expect.objectContaining({ code: "preview_tool_mismatch" })
      ])
    });
    expect(context.audit.list()[1]).toMatchObject({ tool: "product.update.execute", result: "blocked" });
    expect(fetchCalled).toBe(false);
  });

  it("blocks product.update.execute with secret-looking mismatched hashes without leaking them", async () => {
    let fetchCalled = false;
    const context = baseContext(async () => {
      fetchCalled = true;
      return jsonResponse({});
    }, false);
    const preview = await callTool("product.update.preview", {
      productId: "gid://shopify/Product/1",
      title: "Updated Shirt"
    }, context) as Record<string, unknown>;
    const binding = preview.binding as Record<string, unknown>;
    const reviewed = reviewedBindingFor(context, preview);

    const result = await callTool("product.update.execute", {
      previewId: preview.previewId,
      confirmed: true,
      reviewedPayload: reviewed.reviewedPayload,
      expectedTool: binding.expectedTool,
      target: binding.target,
      previewHash: "shpat_hash_a",
      reviewedChangesHash: "shpat_hash_b"
    }, context);
    const output = JSON.stringify(result);

    expect(result).toMatchObject({
      ok: false,
      mode: "execute",
      implemented: true,
      status: "blocked",
      diagnostics: expect.arrayContaining([
        expect.objectContaining({ code: "invalid_secret_like_hash" }),
        expect.objectContaining({ code: "preview_hash_mismatch" }),
        expect.objectContaining({ code: "stored_preview_hash_mismatch" })
      ])
    });
    expect(output).not.toContain("shpat_hash_a");
    expect(output).not.toContain("shpat_hash_b");
    expect(context.audit.list()[1]).toMatchObject({
      tool: "product.update.execute",
      mode: "execute",
      result: "blocked"
    });
    expect(fetchCalled).toBe(false);
  });

  it("blocks product.update.execute before fetch when no preview store exists", async () => {
    let fetchCalled = false;
    const context: ToolContext = {
      config: createConfig({ storeUrl: "demo", readOnly: false }),
      audit: new MemoryAuditLog(),
      fetcher: async () => {
        fetchCalled = true;
        return {
          ok: true,
          status: 200,
          async text() {
            return "{}";
          }
        };
      }
    };

    const result = await callTool("product.update.execute", {
      ...executeBinding("product.update.preview", "gid://shopify/Product/1"),
      confirmed: true
    }, context);

    expect(result).toMatchObject({
      ok: false,
      mode: "execute",
      implemented: true,
      status: "blocked",
      diagnostics: expect.arrayContaining([
        expect.objectContaining({ code: "stored_preview_missing" })
      ])
    });
    expect(context.audit.list()[0]).toMatchObject({
      tool: "product.update.execute",
      mode: "execute",
      result: "blocked"
    });
    expect(fetchCalled).toBe(false);
  });

  it("blocks product.create.execute before fetch when granted scopes are unknown", async () => {
    let fetchCalled = false;
    const context = baseContext(async () => {
      fetchCalled = true;
      return jsonResponse({});
    }, false);
    const preview = await callTool("product.create.preview", {
      title: "Stored Preview Shirt",
      description: "A reviewed product."
    }, context) as Record<string, unknown>;
    const binding = preview.binding as Record<string, unknown>;
    const reviewed = reviewedBindingFor(context, preview);

    const result = await callTool("product.create.execute", {
      previewId: preview.previewId,
      confirmed: true,
      reviewedPayload: reviewed.reviewedPayload,
      expectedTool: binding.expectedTool,
      target: binding.target,
      previewHash: preview.previewHash,
      reviewedChangesHash: reviewed.reviewedChangesHash
    }, context);

    expect(result).toMatchObject({
      ok: false,
      mode: "execute",
      implemented: true,
      status: "blocked",
      diagnostics: expect.arrayContaining([expect.objectContaining({ code: "unknown_write_scopes" })])
    });
    expect(context.audit.list()[1]).toMatchObject({
      tool: "product.create.execute",
      mode: "execute",
      result: "blocked"
    });
    expect(fetchCalled).toBe(false);
  });

  it("blocks product.create.execute before fetch when known granted scopes miss write_products", async () => {
    let fetchCalled = false;
    const context = baseContext(async () => {
      fetchCalled = true;
      return jsonResponse({});
    }, false);
    context.config.grantedScopes = ["read_products", "shpat_scope_secret"];
    const preview = await callTool("product.create.preview", {
      title: "Missing Scope Shirt",
      description: "A reviewed product."
    }, context) as Record<string, unknown>;
    const binding = preview.binding as Record<string, unknown>;
    const reviewed = reviewedBindingFor(context, preview);

    const result = await callTool("product.create.execute", {
      previewId: preview.previewId,
      confirmed: true,
      reviewedPayload: reviewed.reviewedPayload,
      expectedTool: binding.expectedTool,
      target: binding.target,
      previewHash: preview.previewHash,
      reviewedChangesHash: reviewed.reviewedChangesHash
    }, context);
    const output = JSON.stringify(result);

    expect(result).toMatchObject({
      ok: false,
      mode: "execute",
      implemented: true,
      status: "blocked",
      diagnostics: expect.arrayContaining([expect.objectContaining({ code: "missing_write_scope" })])
    });
    expect(output).not.toContain("shpat_scope_secret");
    expect(context.audit.list()[1]).toMatchObject({
      tool: "product.create.execute",
      mode: "execute",
      result: "blocked"
    });
    expect(fetchCalled).toBe(false);
  });

  it("blocks stored product preview execute when reviewed payload does not match", async () => {
    let fetchCalled = false;
    const context = baseContext(async () => {
      fetchCalled = true;
      return jsonResponse({});
    }, false);
    const preview = await callTool("product.create.preview", {
      title: "Mismatch Preview Shirt",
      description: "A reviewed product."
    }, context) as Record<string, unknown>;
    const binding = preview.binding as Record<string, unknown>;

    const result = await callTool("product.create.execute", {
      previewId: preview.previewId,
      confirmed: true,
      reviewedPayload: { title: "Different reviewed payload", token: "shpat_review_secret" },
      expectedTool: binding.expectedTool,
      target: binding.target,
      previewHash: preview.previewHash,
      reviewedChangesHash: hashPreviewContent({ title: "Different reviewed payload", token: "shpat_review_secret" })
    }, context);
    const output = JSON.stringify(result);

    expect(result).toMatchObject({
      ok: false,
      mode: "execute",
      implemented: true,
      status: "blocked",
      diagnostics: expect.arrayContaining([
        expect.objectContaining({ code: "reviewed_payload_hash_mismatch" })
      ])
    });
    expect(output).not.toContain("shpat_review_secret");
    expect(context.audit.list()[1]).toMatchObject({
      tool: "product.create.execute",
      mode: "execute",
      result: "blocked"
    });
    expect(fetchCalled).toBe(false);
  });

  it("blocks expired stored product preview binding before fetch", async () => {
    let fetchCalled = false;
    const context = baseContext(async () => {
      fetchCalled = true;
      return jsonResponse({});
    }, false);
    context.config.grantedScopes = ["write_products"];
    const preview = await callTool("product.create.preview", {
      title: "Expired Preview Shirt",
      description: "A reviewed product."
    }, context) as Record<string, unknown>;
    const binding = preview.binding as Record<string, unknown>;
    const reviewed = reviewedBindingFor(context, preview);
    context.previewStore?.expirePreview(preview.previewId);

    const result = await callTool("product.create.execute", {
      previewId: preview.previewId,
      confirmed: true,
      reviewedPayload: reviewed.reviewedPayload,
      expectedTool: binding.expectedTool,
      target: binding.target,
      previewHash: preview.previewHash,
      reviewedChangesHash: reviewed.reviewedChangesHash
    }, context);

    expect(result).toMatchObject({
      ok: false,
      mode: "execute",
      implemented: true,
      status: "blocked",
      diagnostics: expect.arrayContaining([expect.objectContaining({ code: "stored_preview_expired" })])
    });
    expect(context.audit.list()[1]).toMatchObject({
      tool: "product.create.execute",
      mode: "execute",
      result: "blocked"
    });
    expect(fetchCalled).toBe(false);
  });

  it("calls productCreate only after valid stored preview binding and write_products preflight", async () => {
    const requests: Array<{ body: string }> = [];
    const context = baseContext(async (_url, init) => {
      requests.push({ body: init.body });
      return jsonResponse({
        data: {
          productCreate: {
            product: { id: "gid://shopify/Product/1", title: "Linen Shirt", handle: "linen-shirt", status: "DRAFT", rawNodeOnly: true },
            userErrors: []
          }
        }
      });
    }, false);
    context.config.grantedScopes = ["write_products"];
    const preview = await callTool("product.create.preview", {
      title: "Linen Shirt",
      description: "Light linen shirt.",
      vendor: "Acme",
      productType: "Shirts",
      status: "draft",
      tags: ["linen", "summer"],
      variants: [{ sku: "UNUSED", price: "99.00" }],
      media: [{ url: "https://example.com/ignored.jpg" }]
    }, context) as Record<string, unknown>;
    const binding = preview.binding as Record<string, unknown>;
    const reviewed = reviewedBindingFor(context, preview);

    const result = await callTool("product.create.execute", {
      previewId: preview.previewId,
      confirmed: true,
      reviewedPayload: reviewed.reviewedPayload,
      expectedTool: binding.expectedTool,
      target: binding.target,
      previewHash: preview.previewHash,
      reviewedChangesHash: reviewed.reviewedChangesHash,
      title: "UNRELATED EXECUTE TITLE",
      vendor: "UNRELATED EXECUTE VENDOR"
    }, context);
    const request = JSON.parse(requests[0].body);
    const output = JSON.stringify(result);

    expect(result).toMatchObject({
      ok: true,
      mode: "execute",
      implemented: true,
      status: "ok",
      createdProduct: {
        id: "gid://shopify/Product/1",
        title: "Linen Shirt",
        handle: "linen-shirt",
        status: "DRAFT"
      }
    });
    expect(requests).toHaveLength(1);
    expect(request.query).toContain("mutation ShopifyStoreAgentProductCreate");
    expect(request.query).toContain("productCreate");
    expect(request.query).not.toContain("pageCreate");
    expect(request.query).not.toContain("collectionCreate");
    expect(request.query).not.toContain("refundCreate");
    expect(request.query).not.toContain("media");
    expect(request.query).not.toContain("metafields");
    expect(request.variables.product).toMatchObject({
      title: "Linen Shirt",
      descriptionHtml: "Light linen shirt.",
      vendor: "Acme",
      productType: "Shirts",
      status: "DRAFT",
      tags: ["linen", "summer"]
    });
    expect(request.variables.product).not.toHaveProperty("variants");
    expect(request.variables.product).not.toHaveProperty("media");
    expect(request.variables.product).not.toHaveProperty("collections");
    expect(requests[0].body).not.toContain("UNRELATED EXECUTE TITLE");
    expect(requests[0].body).not.toContain("UNRELATED EXECUTE VENDOR");
    expect(output).not.toContain("rawNodeOnly");
    expect(output).not.toContain("Light linen shirt.");
    expect(context.audit.list()[1]).toMatchObject({ tool: "product.create.execute", result: "success" });
  });

  it("returns Shopify product create user errors safely", async () => {
    const context = baseContext(undefined, false);
    context.fetcher = async () => jsonResponse({
      data: {
        productCreate: {
          product: null,
          userErrors: [{ field: ["title"], message: "Title has already been taken." }]
        }
      }
    });
    context.config.grantedScopes = ["write_products"];
    const preview = await callTool("product.create.preview", {
      title: "Linen Shirt",
      description: "Light linen shirt."
    }, context) as Record<string, unknown>;
    const binding = preview.binding as Record<string, unknown>;
    const reviewed = reviewedBindingFor(context, preview);

    const result = await callTool("product.create.execute", {
      previewId: preview.previewId,
      confirmed: true,
      reviewedPayload: reviewed.reviewedPayload,
      expectedTool: binding.expectedTool,
      target: binding.target,
      previewHash: preview.previewHash,
      reviewedChangesHash: reviewed.reviewedChangesHash
    }, context);

    expect(result).toMatchObject({
      ok: false,
      mode: "execute",
      implemented: true,
      status: "user_errors",
      userErrors: [{ field: ["title"], message: "Title has already been taken." }]
    });
    expect(context.audit.list()[1]).toMatchObject({ tool: "product.create.execute", result: "blocked" });
  });

  it("returns safe failed audit for product.create.execute network errors", async () => {
    const context = baseContext(async () => {
      throw new Error("network failed with token shpat_product_execute_secret");
    }, false);
    context.config.grantedScopes = ["write_products"];
    const preview = await callTool("product.create.preview", {
      title: "Linen Shirt",
      description: "Light linen shirt."
    }, context) as Record<string, unknown>;
    const binding = preview.binding as Record<string, unknown>;
    const reviewed = reviewedBindingFor(context, preview);

    const result = await callTool("product.create.execute", {
      previewId: preview.previewId,
      confirmed: true,
      reviewedPayload: reviewed.reviewedPayload,
      expectedTool: binding.expectedTool,
      target: binding.target,
      previewHash: preview.previewHash,
      reviewedChangesHash: reviewed.reviewedChangesHash
    }, context);
    const output = JSON.stringify(result);

    expect(result).toMatchObject({
      ok: false,
      mode: "execute",
      implemented: true,
      status: "shopify_error",
      diagnostics: [{ code: "shopify_request_failed" }]
    });
    expect(output).not.toContain("shpat_product_execute_secret");
    expect(context.audit.list()[1]).toMatchObject({
      tool: "product.create.execute",
      mode: "execute",
      result: "failed"
    });
  });

  it("blocks product.update.execute in read-only mode before fetch", async () => {
    let fetchCalled = false;
    const context = baseContext(async () => {
      fetchCalled = true;
      return jsonResponse({});
    });
    const preview = await callTool("product.update.preview", {
      productId: "gid://shopify/Product/1",
      title: "Updated Shirt"
    }, context) as Record<string, unknown>;
    const binding = preview.binding as Record<string, unknown>;
    const reviewed = reviewedBindingFor(context, preview);

    const result = await callTool("product.update.execute", {
      previewId: preview.previewId,
      confirmed: true,
      reviewedPayload: reviewed.reviewedPayload,
      expectedTool: binding.expectedTool,
      target: binding.target,
      previewHash: preview.previewHash,
      reviewedChangesHash: reviewed.reviewedChangesHash
    }, context);

    expect(result).toMatchObject({
      ok: false,
      mode: "execute",
      implemented: true,
      status: "blocked",
      diagnostics: expect.arrayContaining([expect.objectContaining({ code: "read_only" })])
    });
    expect(context.audit.list()[1]).toMatchObject({ tool: "product.update.execute", result: "blocked" });
    expect(fetchCalled).toBe(false);
  });

  it("blocks product.update.execute without confirmation before fetch", async () => {
    let fetchCalled = false;
    const context = baseContext(async () => {
      fetchCalled = true;
      return jsonResponse({});
    }, false);
    const preview = await callTool("product.update.preview", {
      productId: "gid://shopify/Product/1",
      title: "Updated Shirt"
    }, context) as Record<string, unknown>;
    const binding = preview.binding as Record<string, unknown>;
    const reviewed = reviewedBindingFor(context, preview);

    const result = await callTool("product.update.execute", {
      previewId: preview.previewId,
      reviewedPayload: reviewed.reviewedPayload,
      expectedTool: binding.expectedTool,
      target: binding.target,
      previewHash: preview.previewHash,
      reviewedChangesHash: reviewed.reviewedChangesHash
    }, context);

    expect(result).toMatchObject({
      ok: false,
      mode: "execute",
      implemented: true,
      status: "blocked",
      diagnostics: expect.arrayContaining([expect.objectContaining({ code: "missing_confirmation" })])
    });
    expect(context.audit.list()[1]).toMatchObject({ tool: "product.update.execute", result: "blocked" });
    expect(fetchCalled).toBe(false);
  });

  it("blocks product.update.execute with expired stored preview before fetch", async () => {
    let fetchCalled = false;
    const context = baseContext(async () => {
      fetchCalled = true;
      return jsonResponse({});
    }, false);
    const preview = await callTool("product.update.preview", {
      productId: "gid://shopify/Product/1",
      title: "Updated Shirt"
    }, context) as Record<string, unknown>;
    const binding = preview.binding as Record<string, unknown>;
    const reviewed = reviewedBindingFor(context, preview);
    context.previewStore?.expirePreview(preview.previewId);

    const result = await callTool("product.update.execute", {
      previewId: preview.previewId,
      confirmed: true,
      reviewedPayload: reviewed.reviewedPayload,
      expectedTool: binding.expectedTool,
      target: binding.target,
      previewHash: preview.previewHash,
      reviewedChangesHash: reviewed.reviewedChangesHash
    }, context);

    expect(result).toMatchObject({
      ok: false,
      mode: "execute",
      implemented: true,
      status: "blocked",
      diagnostics: expect.arrayContaining([expect.objectContaining({ code: "stored_preview_expired" })])
    });
    expect(context.audit.list()[1]).toMatchObject({ tool: "product.update.execute", result: "blocked" });
    expect(fetchCalled).toBe(false);
  });

  it("blocks product.update.execute with mismatched target, hash, and reviewed payload before fetch", async () => {
    let fetchCalled = false;
    const context = baseContext(async () => {
      fetchCalled = true;
      return jsonResponse({});
    }, false);
    const preview = await callTool("product.update.preview", {
      productId: "gid://shopify/Product/1",
      title: "Updated Shirt"
    }, context) as Record<string, unknown>;
    const binding = preview.binding as Record<string, unknown>;

    const result = await callTool("product.update.execute", {
      previewId: preview.previewId,
      confirmed: true,
      reviewedPayload: { arbitrary: "payload", token: "shpat_product_update_review_secret" },
      expectedTool: binding.expectedTool,
      target: "gid://shopify/Product/2",
      previewHash: "sha256:different",
      reviewedChangesHash: hashPreviewContent({ arbitrary: "payload", token: "shpat_product_update_review_secret" }),
      title: "UNTRUSTED EXECUTE TITLE"
    }, context);
    const output = JSON.stringify(result);

    expect(result).toMatchObject({
      ok: false,
      mode: "execute",
      implemented: true,
      status: "blocked",
      diagnostics: expect.arrayContaining([
        expect.objectContaining({ code: "stored_preview_target_mismatch" }),
        expect.objectContaining({ code: "stored_preview_hash_mismatch" }),
        expect.objectContaining({ code: "reviewed_payload_hash_mismatch" })
      ])
    });
    expect(output).not.toContain("shpat_product_update_review_secret");
    expect(context.audit.list()[1]).toMatchObject({ tool: "product.update.execute", result: "blocked" });
    expect(fetchCalled).toBe(false);
  });

  it("blocks product.update.execute before fetch when granted scopes are unknown", async () => {
    let fetchCalled = false;
    const context = baseContext(async () => {
      fetchCalled = true;
      return jsonResponse({});
    }, false);
    const preview = await callTool("product.update.preview", {
      productId: "gid://shopify/Product/1",
      title: "Updated Shirt"
    }, context) as Record<string, unknown>;
    const binding = preview.binding as Record<string, unknown>;
    const reviewed = reviewedBindingFor(context, preview);

    const result = await callTool("product.update.execute", {
      previewId: preview.previewId,
      confirmed: true,
      reviewedPayload: reviewed.reviewedPayload,
      expectedTool: binding.expectedTool,
      target: binding.target,
      previewHash: preview.previewHash,
      reviewedChangesHash: reviewed.reviewedChangesHash
    }, context);

    expect(result).toMatchObject({
      ok: false,
      mode: "execute",
      implemented: true,
      status: "blocked",
      diagnostics: expect.arrayContaining([expect.objectContaining({ code: "unknown_write_scopes" })])
    });
    expect(context.audit.list()[1]).toMatchObject({ tool: "product.update.execute", result: "blocked" });
    expect(fetchCalled).toBe(false);
  });

  it("blocks product.update.execute before fetch when known scopes miss write_products", async () => {
    let fetchCalled = false;
    const context = baseContext(async () => {
      fetchCalled = true;
      return jsonResponse({});
    }, false);
    context.config.grantedScopes = ["read_products", "shpat_scope_secret"];
    const preview = await callTool("product.update.preview", {
      productId: "gid://shopify/Product/1",
      title: "Updated Shirt"
    }, context) as Record<string, unknown>;
    const binding = preview.binding as Record<string, unknown>;
    const reviewed = reviewedBindingFor(context, preview);

    const result = await callTool("product.update.execute", {
      previewId: preview.previewId,
      confirmed: true,
      reviewedPayload: reviewed.reviewedPayload,
      expectedTool: binding.expectedTool,
      target: binding.target,
      previewHash: preview.previewHash,
      reviewedChangesHash: reviewed.reviewedChangesHash
    }, context);
    const output = JSON.stringify(result);

    expect(result).toMatchObject({
      ok: false,
      mode: "execute",
      implemented: true,
      status: "blocked",
      diagnostics: expect.arrayContaining([expect.objectContaining({ code: "missing_write_scope" })])
    });
    expect(output).not.toContain("shpat_scope_secret");
    expect(context.audit.list()[1]).toMatchObject({ tool: "product.update.execute", result: "blocked" });
    expect(fetchCalled).toBe(false);
  });

  it("calls only productUpdate after valid stored product update binding and write_products preflight", async () => {
    const requests: Array<{ body: string }> = [];
    const context = baseContext(async (_url, init) => {
      requests.push({ body: init.body });
      return jsonResponse({
        data: {
          productUpdate: {
            product: {
              id: "gid://shopify/Product/1",
              title: "Stored Update Shirt",
              handle: "stored-update-shirt",
              status: "ACTIVE",
              rawNodeOnly: "do not return",
              variants: { nodes: [{ id: "do-not-return" }] },
              media: { nodes: [{ id: "do-not-return" }] },
              metafields: { nodes: [{ id: "do-not-return" }] },
              seo: { title: "do-not-return" },
              inventoryQuantity: 5
            },
            userErrors: []
          }
        }
      });
    }, false);
    context.config.grantedScopes = ["write_products"];
    const preview = await callTool("product.update.preview", {
      productId: "gid://shopify/Product/1",
      title: "Stored Update Shirt",
      description: "<p>Updated description from preview.</p>",
      vendor: "Acme",
      productType: "Shirts",
      status: "active",
      tags: ["linen", "summer"],
      variants: [{ sku: "UNUSED" }],
      media: [{ url: "https://example.com/ignored.jpg" }],
      metafields: [{ key: "ignored" }],
      seo: { title: "ignored" },
      inventory: { quantity: 100 }
    }, context) as Record<string, unknown>;
    const binding = preview.binding as Record<string, unknown>;
    const reviewed = reviewedBindingFor(context, preview);

    const result = await callTool("product.update.execute", {
      previewId: preview.previewId,
      confirmed: true,
      reviewedPayload: reviewed.reviewedPayload,
      expectedTool: binding.expectedTool,
      target: binding.target,
      previewHash: preview.previewHash,
      reviewedChangesHash: reviewed.reviewedChangesHash,
      title: "UNRELATED EXECUTE TITLE",
      vendor: "UNRELATED EXECUTE VENDOR",
      variants: [{ sku: "UNTRUSTED" }]
    }, context);
    const request = JSON.parse(requests[0].body);
    const output = JSON.stringify(result);

    expect(result).toMatchObject({
      ok: true,
      mode: "execute",
      implemented: true,
      status: "ok",
      updatedProduct: {
        id: "gid://shopify/Product/1",
        title: "Stored Update Shirt",
        handle: "stored-update-shirt",
        status: "ACTIVE"
      }
    });
    expect(requests).toHaveLength(1);
    expect(request.query).toContain("mutation ShopifyStoreAgentProductUpdate");
    expect(request.query).toContain("productUpdate");
    expect(request.query).not.toContain("productCreate");
    expect(request.query).not.toContain("pageCreate");
    expect(request.query).not.toContain("collectionCreate");
    expect(request.query).not.toContain("refundCreate");
    expect(request.query).not.toContain("variants");
    expect(request.query).not.toContain("media");
    expect(request.query).not.toContain("collections");
    expect(request.query).not.toContain("metafields");
    expect(request.query).not.toContain("seo");
    expect(request.query).not.toContain("inventory");
    expect(request.variables.product).toEqual({
      id: "gid://shopify/Product/1",
      title: "Stored Update Shirt",
      descriptionHtml: "<p>Updated description from preview.</p>",
      vendor: "Acme",
      productType: "Shirts",
      status: "ACTIVE",
      tags: ["linen", "summer"]
    });
    expect(requests[0].body).not.toContain("UNRELATED EXECUTE TITLE");
    expect(requests[0].body).not.toContain("UNRELATED EXECUTE VENDOR");
    expect(request.variables.product).not.toHaveProperty("variants");
    expect(request.variables.product).not.toHaveProperty("media");
    expect(request.variables.product).not.toHaveProperty("metafields");
    expect(request.variables.product).not.toHaveProperty("seo");
    expect(request.variables.product).not.toHaveProperty("inventory");
    expect(output).not.toContain("rawNodeOnly");
    expect(output).not.toContain("Updated description from preview");
    expect(output).not.toContain("variants");
    expect(output).not.toContain("media");
    expect(output).not.toContain("metafields");
    expect(output).not.toContain("seo");
    expect(output).not.toContain("inventoryQuantity");
    expect(context.audit.list()[1]).toMatchObject({ tool: "product.update.execute", result: "success" });
  });

  it("updates explicit variant prices from stored product update preview via productVariantsBulkUpdate", async () => {
    const requests: Array<{ body: string }> = [];
    const context = baseContext(async (_url, init) => {
      requests.push({ body: init.body });
      return jsonResponse({
        data: {
          productVariantsBulkUpdate: {
            productVariants: [
              {
                id: "gid://shopify/ProductVariant/1",
                price: "39.00",
                rawNodeOnly: "do-not-return",
                inventoryQuantity: 10
              }
            ],
            userErrors: []
          }
        }
      });
    }, false);
    context.config.grantedScopes = ["write_products"];
    const preview = await callTool("product.update.preview", {
      productId: "gid://shopify/Product/1",
      variants: [{ id: "gid://shopify/ProductVariant/1", price: "39.00", inventoryQuantity: 10 }]
    }, context) as Record<string, unknown>;
    const binding = preview.binding as Record<string, unknown>;
    const reviewed = reviewedBindingFor(context, preview);

    const result = await callTool("product.update.execute", {
      previewId: preview.previewId,
      confirmed: true,
      reviewedPayload: reviewed.reviewedPayload,
      expectedTool: binding.expectedTool,
      target: binding.target,
      previewHash: preview.previewHash,
      reviewedChangesHash: reviewed.reviewedChangesHash,
      variants: [{ id: "gid://shopify/ProductVariant/999", price: "1.00" }]
    }, context);
    const request = JSON.parse(requests[0].body);
    const output = JSON.stringify(result);

    expect(result).toMatchObject({
      ok: true,
      mode: "execute",
      implemented: true,
      status: "ok",
      updatedVariantPrices: {
        productId: "gid://shopify/Product/1",
        updatedVariantCount: 1,
        variants: [{ id: "gid://shopify/ProductVariant/1", price: "39.00" }]
      }
    });
    expect(requests).toHaveLength(1);
    expect(request.query).toContain("mutation ShopifyStoreAgentProductVariantPricesUpdate");
    expect(request.query).toContain("productVariantsBulkUpdate");
    expect(request.query).not.toContain("productUpdate");
    expect(request.query).not.toContain("productCreate");
    expect(request.query).not.toContain("inventory");
    expect(request.variables).toEqual({
      productId: "gid://shopify/Product/1",
      variants: [{ id: "gid://shopify/ProductVariant/1", price: "39.00" }]
    });
    expect(requests[0].body).not.toContain("gid://shopify/ProductVariant/999");
    expect(output).not.toContain("rawNodeOnly");
    expect(output).not.toContain("inventoryQuantity");
    expect(context.audit.list()[1]).toMatchObject({ tool: "product.update.execute", result: "success" });
  });

  it("creates explicit variants from stored product update preview via productVariantsBulkCreate", async () => {
    const requests: Array<{ body: string }> = [];
    const context = baseContext(async (_url, init) => {
      requests.push({ body: init.body });
      return jsonResponse({
        data: {
          productVariantsBulkCreate: {
            productVariants: [
              {
                id: "gid://shopify/ProductVariant/2",
                title: "Large",
                price: "49.00",
                sku: "LINEN-L",
                rawNodeOnly: "do-not-return",
                inventoryQuantity: 10,
                metafields: { nodes: [{ id: "do-not-return" }] }
              }
            ],
            userErrors: []
          }
        }
      });
    }, false);
    context.config.grantedScopes = ["write_products"];
    const preview = await callTool("product.update.preview", {
      productId: "gid://shopify/Product/1",
      variants: [{
        optionValues: [{ optionName: "Size", name: "Large" }],
        price: "49.00",
        sku: "LINEN-L",
        inventoryQuantity: 10,
        metafields: [{ key: "ignored" }]
      }]
    }, context) as Record<string, unknown>;
    const binding = preview.binding as Record<string, unknown>;
    const reviewed = reviewedBindingFor(context, preview);

    const result = await callTool("product.update.execute", {
      previewId: preview.previewId,
      confirmed: true,
      reviewedPayload: reviewed.reviewedPayload,
      expectedTool: binding.expectedTool,
      target: binding.target,
      previewHash: preview.previewHash,
      reviewedChangesHash: reviewed.reviewedChangesHash,
      variants: [{ optionValues: [{ optionName: "Size", name: "Small" }], price: "1.00" }]
    }, context);
    const request = JSON.parse(requests[0].body);
    const output = JSON.stringify(result);

    expect(result).toMatchObject({
      ok: true,
      mode: "execute",
      implemented: true,
      status: "ok",
      createdVariants: {
        productId: "gid://shopify/Product/1",
        createdVariantCount: 1,
        variants: [{ id: "gid://shopify/ProductVariant/2", title: "Large", price: "49.00", sku: "LINEN-L" }]
      }
    });
    expect(requests).toHaveLength(1);
    expect(request.query).toContain("mutation ShopifyStoreAgentProductVariantsCreate");
    expect(request.query).toContain("productVariantsBulkCreate");
    expect(request.query).not.toContain("productUpdate");
    expect(request.query).not.toContain("productVariantsBulkUpdate");
    expect(request.query).not.toContain("inventory");
    expect(request.query).not.toContain("metafields");
    expect(request.variables).toEqual({
      productId: "gid://shopify/Product/1",
      variants: [{
        optionValues: [{ optionName: "Size", name: "Large" }],
        price: "49.00",
        sku: "LINEN-L"
      }]
    });
    expect(requests[0].body).not.toContain("Small");
    expect(output).not.toContain("rawNodeOnly");
    expect(output).not.toContain("inventoryQuantity");
    expect(output).not.toContain("metafields");
    expect(context.audit.list()[1]).toMatchObject({ tool: "product.update.execute", result: "success" });
  });

  it("creates explicit product options from stored product update preview via productOptionsCreate", async () => {
    const requests: Array<{ body: string }> = [];
    const context = baseContext(async (_url, init) => {
      requests.push({ body: init.body });
      return jsonResponse({
        data: {
          productOptionsCreate: {
            product: {
              id: "gid://shopify/Product/1",
              options: [
                {
                  id: "gid://shopify/ProductOption/1",
                  name: "Material",
                  position: 2,
                  optionValues: [
                    { id: "gid://shopify/ProductOptionValue/1", name: "Cotton", hasVariants: true },
                    { id: "gid://shopify/ProductOptionValue/2", name: "Linen", hasVariants: false }
                  ],
                  rawNodeOnly: "do-not-return"
                }
              ],
              variants: { nodes: [{ id: "do-not-return" }] },
              metafields: { nodes: [{ id: "do-not-return" }] }
            },
            userErrors: []
          }
        }
      });
    }, false);
    context.config.grantedScopes = ["write_products"];
    const preview = await callTool("product.update.preview", {
      productId: "gid://shopify/Product/1",
      options: [{
        name: "Material",
        values: ["Cotton", "Linen"],
        linkedMetafield: { namespace: "custom", key: "ignored" }
      }]
    }, context) as Record<string, unknown>;
    const binding = preview.binding as Record<string, unknown>;
    const reviewed = reviewedBindingFor(context, preview);

    const result = await callTool("product.update.execute", {
      previewId: preview.previewId,
      confirmed: true,
      reviewedPayload: reviewed.reviewedPayload,
      expectedTool: binding.expectedTool,
      target: binding.target,
      previewHash: preview.previewHash,
      reviewedChangesHash: reviewed.reviewedChangesHash,
      options: [{ name: "Material", values: ["Untrusted"] }]
    }, context);
    const request = JSON.parse(requests[0].body);
    const output = JSON.stringify(result);

    expect(result).toMatchObject({
      ok: true,
      mode: "execute",
      implemented: true,
      status: "ok",
      createdOptions: {
        productId: "gid://shopify/Product/1",
        createdOptionCount: 1,
        variantStrategy: "LEAVE_AS_IS",
        options: [{ id: "gid://shopify/ProductOption/1", name: "Material", position: 2, values: ["Cotton", "Linen"] }]
      }
    });
    expect(requests).toHaveLength(1);
    expect(request.query).toContain("mutation ShopifyStoreAgentProductOptionsCreate");
    expect(request.query).toContain("productOptionsCreate");
    expect(request.query).not.toContain("productUpdate");
    expect(request.query).not.toContain("productVariantsBulkCreate");
    expect(request.query).not.toContain("inventory");
    expect(request.query).not.toContain("metafields");
    expect(request.variables).toEqual({
      productId: "gid://shopify/Product/1",
      options: [{ name: "Material", values: [{ name: "Cotton" }, { name: "Linen" }] }],
      variantStrategy: "LEAVE_AS_IS"
    });
    expect(requests[0].body).not.toContain("Untrusted");
    expect(output).not.toContain("rawNodeOnly");
    expect(output).not.toContain("metafields");
    expect(output).not.toContain("variants");
    expect(context.audit.list()[1]).toMatchObject({ tool: "product.update.execute", result: "success" });
  });

  it("blocks mixed basic product and variant price update preview before fetch", async () => {
    let fetchCalled = false;
    const context = baseContext(async () => {
      fetchCalled = true;
      return jsonResponse({});
    }, false);
    context.config.grantedScopes = ["write_products"];
    const preview = await callTool("product.update.preview", {
      productId: "gid://shopify/Product/1",
      title: "Mixed Update",
      variants: [{ id: "gid://shopify/ProductVariant/1", price: "39.00" }]
    }, context) as Record<string, unknown>;
    const binding = preview.binding as Record<string, unknown>;
    const reviewed = reviewedBindingFor(context, preview);

    const result = await callTool("product.update.execute", {
      previewId: preview.previewId,
      confirmed: true,
      reviewedPayload: reviewed.reviewedPayload,
      expectedTool: binding.expectedTool,
      target: binding.target,
      previewHash: preview.previewHash,
      reviewedChangesHash: reviewed.reviewedChangesHash
    }, context);

    expect(result).toMatchObject({
      ok: false,
      mode: "execute",
      implemented: true,
      status: "blocked",
      diagnostics: expect.arrayContaining([expect.objectContaining({ code: "mixed_product_update_fields" })])
    });
    expect(fetchCalled).toBe(false);
    expect(context.audit.list()[1]).toMatchObject({ tool: "product.update.execute", result: "blocked" });
  });

  it("blocks mixed basic product and variant create preview before fetch", async () => {
    let fetchCalled = false;
    const context = baseContext(async () => {
      fetchCalled = true;
      return jsonResponse({});
    }, false);
    context.config.grantedScopes = ["write_products"];
    const preview = await callTool("product.update.preview", {
      productId: "gid://shopify/Product/1",
      title: "Mixed Variant Create",
      variants: [{ optionValues: [{ optionName: "Size", name: "Large" }] }]
    }, context) as Record<string, unknown>;
    const binding = preview.binding as Record<string, unknown>;
    const reviewed = reviewedBindingFor(context, preview);

    const result = await callTool("product.update.execute", {
      previewId: preview.previewId,
      confirmed: true,
      reviewedPayload: reviewed.reviewedPayload,
      expectedTool: binding.expectedTool,
      target: binding.target,
      previewHash: preview.previewHash,
      reviewedChangesHash: reviewed.reviewedChangesHash
    }, context);

    expect(result).toMatchObject({
      ok: false,
      mode: "execute",
      implemented: true,
      status: "blocked",
      diagnostics: expect.arrayContaining([expect.objectContaining({ code: "mixed_product_update_fields" })])
    });
    expect(fetchCalled).toBe(false);
    expect(context.audit.list()[1]).toMatchObject({ tool: "product.update.execute", result: "blocked" });
  });

  it("blocks mixed basic product and option create preview before fetch", async () => {
    let fetchCalled = false;
    const context = baseContext(async () => {
      fetchCalled = true;
      return jsonResponse({});
    }, false);
    context.config.grantedScopes = ["write_products"];
    const preview = await callTool("product.update.preview", {
      productId: "gid://shopify/Product/1",
      title: "Mixed Option Create",
      options: [{ name: "Material", values: ["Cotton"] }]
    }, context) as Record<string, unknown>;
    const binding = preview.binding as Record<string, unknown>;
    const reviewed = reviewedBindingFor(context, preview);

    const result = await callTool("product.update.execute", {
      previewId: preview.previewId,
      confirmed: true,
      reviewedPayload: reviewed.reviewedPayload,
      expectedTool: binding.expectedTool,
      target: binding.target,
      previewHash: preview.previewHash,
      reviewedChangesHash: reviewed.reviewedChangesHash
    }, context);

    expect(result).toMatchObject({
      ok: false,
      mode: "execute",
      implemented: true,
      status: "blocked",
      diagnostics: expect.arrayContaining([expect.objectContaining({ code: "mixed_product_update_fields" })])
    });
    expect(fetchCalled).toBe(false);
    expect(context.audit.list()[1]).toMatchObject({ tool: "product.update.execute", result: "blocked" });
  });

  it("blocks handle-only product.update.execute when stored preview has no safe product ID", async () => {
    let fetchCalled = false;
    const context = baseContext(async () => {
      fetchCalled = true;
      return jsonResponse({});
    }, false);
    context.config.grantedScopes = ["write_products"];
    const preview = await callTool("product.update.preview", {
      handle: "stored-update-shirt",
      title: "Stored Update Shirt"
    }, context) as Record<string, unknown>;
    const binding = preview.binding as Record<string, unknown>;
    const reviewed = reviewedBindingFor(context, preview);

    const result = await callTool("product.update.execute", {
      previewId: preview.previewId,
      confirmed: true,
      reviewedPayload: reviewed.reviewedPayload,
      expectedTool: binding.expectedTool,
      target: binding.target,
      previewHash: preview.previewHash,
      reviewedChangesHash: reviewed.reviewedChangesHash
    }, context);

    expect(result).toMatchObject({
      ok: false,
      mode: "execute",
      implemented: true,
      status: "blocked",
      diagnostics: expect.arrayContaining([expect.objectContaining({ code: "missing_product_update_id" })])
    });
    expect(context.audit.list()[1]).toMatchObject({ tool: "product.update.execute", result: "blocked" });
    expect(fetchCalled).toBe(false);
  });

  it("blocks product.update.execute when stored preview contains only unsupported fields", async () => {
    let fetchCalled = false;
    const context = baseContext(async () => {
      fetchCalled = true;
      return jsonResponse({});
    }, false);
    context.config.grantedScopes = ["write_products"];
    const preview = await callTool("product.update.preview", {
      productId: "gid://shopify/Product/1",
      variants: [{ sku: "UNSUPPORTED" }],
      media: [{ url: "https://example.com/unsupported.jpg" }],
      metafields: [{ key: "unsupported" }],
      seo: { title: "unsupported" },
      inventory: { quantity: 100 }
    }, context) as Record<string, unknown>;
    const binding = preview.binding as Record<string, unknown>;
    const reviewed = reviewedBindingFor(context, preview);

    const result = await callTool("product.update.execute", {
      previewId: preview.previewId,
      confirmed: true,
      reviewedPayload: reviewed.reviewedPayload,
      expectedTool: binding.expectedTool,
      target: binding.target,
      previewHash: preview.previewHash,
      reviewedChangesHash: reviewed.reviewedChangesHash
    }, context);

    expect(result).toMatchObject({
      ok: false,
      mode: "execute",
      implemented: true,
      status: "blocked",
      diagnostics: expect.arrayContaining([expect.objectContaining({ code: "missing_product_update_fields" })])
    });
    expect(context.audit.list()[1]).toMatchObject({ tool: "product.update.execute", result: "blocked" });
    expect(fetchCalled).toBe(false);
  });

  it("returns Shopify product update user errors safely", async () => {
    const context = baseContext(async () => jsonResponse({
      data: {
        productUpdate: {
          product: null,
          userErrors: [{ field: ["title"], message: "Title is invalid." }]
        }
      }
    }), false);
    context.config.grantedScopes = ["write_products"];
    const preview = await callTool("product.update.preview", {
      productId: "gid://shopify/Product/1",
      title: "Updated Shirt"
    }, context) as Record<string, unknown>;
    const binding = preview.binding as Record<string, unknown>;
    const reviewed = reviewedBindingFor(context, preview);

    const result = await callTool("product.update.execute", {
      previewId: preview.previewId,
      confirmed: true,
      reviewedPayload: reviewed.reviewedPayload,
      expectedTool: binding.expectedTool,
      target: binding.target,
      previewHash: preview.previewHash,
      reviewedChangesHash: reviewed.reviewedChangesHash
    }, context);

    expect(result).toMatchObject({
      ok: false,
      mode: "execute",
      implemented: true,
      status: "user_errors",
      userErrors: [{ field: ["title"], message: "Title is invalid." }]
    });
    expect(context.audit.list()[1]).toMatchObject({ tool: "product.update.execute", result: "blocked" });
  });

  it("returns safe failed audit for product.update.execute network errors", async () => {
    const context = baseContext(async () => {
      throw new Error("network failed with token shpat_product_update_execute_secret");
    }, false);
    context.config.grantedScopes = ["write_products"];
    const preview = await callTool("product.update.preview", {
      productId: "gid://shopify/Product/1",
      title: "Updated Shirt"
    }, context) as Record<string, unknown>;
    const binding = preview.binding as Record<string, unknown>;
    const reviewed = reviewedBindingFor(context, preview);

    const result = await callTool("product.update.execute", {
      previewId: preview.previewId,
      confirmed: true,
      reviewedPayload: reviewed.reviewedPayload,
      expectedTool: binding.expectedTool,
      target: binding.target,
      previewHash: preview.previewHash,
      reviewedChangesHash: reviewed.reviewedChangesHash
    }, context);
    const output = JSON.stringify(result);

    expect(result).toMatchObject({
      ok: false,
      mode: "execute",
      implemented: true,
      status: "shopify_error",
      diagnostics: [{ code: "shopify_request_failed" }]
    });
    expect(output).not.toContain("shpat_product_update_execute_secret");
    expect(context.audit.list()[1]).toMatchObject({
      tool: "product.update.execute",
      mode: "execute",
      result: "failed"
    });
  });

  it("blocks page.create.execute in read-only mode before fetch", async () => {
    let fetchCalled = false;
    const context = baseContext(async () => {
      fetchCalled = true;
      return jsonResponse({});
    });
    const preview = await callTool("page.create.preview", {
      title: "Care Guide",
      body: "Wash cold."
    }, context) as Record<string, unknown>;
    const binding = preview.binding as Record<string, unknown>;
    const reviewed = reviewedBindingFor(context, preview);

    const result = await callTool("page.create.execute", {
      previewId: preview.previewId,
      confirmed: true,
      reviewedPayload: reviewed.reviewedPayload,
      expectedTool: binding.expectedTool,
      target: binding.target,
      previewHash: preview.previewHash,
      reviewedChangesHash: reviewed.reviewedChangesHash
    }, context);

    expect(result).toMatchObject({
      ok: false,
      mode: "execute",
      implemented: true,
      status: "blocked",
      diagnostics: expect.arrayContaining([expect.objectContaining({ code: "read_only" })])
    });
    expect(context.audit.list()[1]).toMatchObject({ tool: "page.create.execute", result: "blocked" });
    expect(fetchCalled).toBe(false);
  });

  it("blocks page.create.execute without confirmation", async () => {
    let fetchCalled = false;
    const context = baseContext(async () => {
      fetchCalled = true;
      return jsonResponse({});
    }, false);
    const preview = await callTool("page.create.preview", {
      title: "Care Guide",
      body: "Wash cold."
    }, context) as Record<string, unknown>;
    const binding = preview.binding as Record<string, unknown>;
    const reviewed = reviewedBindingFor(context, preview);

    const result = await callTool("page.create.execute", {
      previewId: preview.previewId,
      reviewedPayload: reviewed.reviewedPayload,
      expectedTool: binding.expectedTool,
      target: binding.target,
      previewHash: preview.previewHash,
      reviewedChangesHash: reviewed.reviewedChangesHash
    }, context);

    expect(result).toMatchObject({
      ok: false,
      mode: "execute",
      implemented: true,
      status: "blocked",
      diagnostics: expect.arrayContaining([expect.objectContaining({ code: "missing_confirmation" })])
    });
    expect(context.audit.list()[1]).toMatchObject({ tool: "page.create.execute", result: "blocked" });
    expect(fetchCalled).toBe(false);
  });

  it("blocks page.create.execute without a stored preview", async () => {
    let fetchCalled = false;
    const context = baseContext(async () => {
      fetchCalled = true;
      return jsonResponse({});
    }, false);

    const result = await callTool("page.create.execute", {
      ...executeBinding("page.create.preview", "Care Guide"),
      confirmed: true,
      title: "Care Guide"
    }, context);

    expect(result).toMatchObject({
      ok: false,
      mode: "execute",
      implemented: true,
      status: "blocked",
      diagnostics: expect.arrayContaining([expect.objectContaining({ code: "stored_preview_missing" })])
    });
    expect(context.audit.list()[0]).toMatchObject({ tool: "page.create.execute", result: "blocked" });
    expect(fetchCalled).toBe(false);
  });

  it("blocks page.create.execute with expired stored preview", async () => {
    let fetchCalled = false;
    const context = baseContext(async () => {
      fetchCalled = true;
      return jsonResponse({});
    }, false);
    const preview = await callTool("page.create.preview", {
      title: "Care Guide",
      body: "Wash cold."
    }, context) as Record<string, unknown>;
    const binding = preview.binding as Record<string, unknown>;
    const reviewed = reviewedBindingFor(context, preview);
    context.previewStore?.expirePreview(preview.previewId);

    const result = await callTool("page.create.execute", {
      previewId: preview.previewId,
      confirmed: true,
      reviewedPayload: reviewed.reviewedPayload,
      expectedTool: binding.expectedTool,
      target: binding.target,
      previewHash: preview.previewHash,
      reviewedChangesHash: reviewed.reviewedChangesHash
    }, context);

    expect(result).toMatchObject({
      ok: false,
      mode: "execute",
      implemented: true,
      status: "blocked",
      diagnostics: expect.arrayContaining([expect.objectContaining({ code: "stored_preview_expired" })])
    });
    expect(context.audit.list()[1]).toMatchObject({ tool: "page.create.execute", result: "blocked" });
    expect(fetchCalled).toBe(false);
  });

  it("blocks page.create.execute with mismatched target, hash, and reviewed payload before fetch", async () => {
    let fetchCalled = false;
    const context = baseContext(async () => {
      fetchCalled = true;
      return jsonResponse({});
    }, false);
    const preview = await callTool("page.create.preview", {
      title: "Care Guide",
      body: "Wash cold."
    }, context) as Record<string, unknown>;
    const binding = preview.binding as Record<string, unknown>;

    const result = await callTool("page.create.execute", {
      previewId: preview.previewId,
      confirmed: true,
      reviewedPayload: { arbitrary: "payload", token: "shpat_page_review_secret" },
      expectedTool: binding.expectedTool,
      target: "Different Page",
      previewHash: "sha256:different",
      reviewedChangesHash: hashPreviewContent({ arbitrary: "payload", token: "shpat_page_review_secret" }),
      body: "This execute-only body must not be trusted."
    }, context);
    const output = JSON.stringify(result);

    expect(result).toMatchObject({
      ok: false,
      mode: "execute",
      implemented: true,
      status: "blocked",
      diagnostics: expect.arrayContaining([
        expect.objectContaining({ code: "stored_preview_target_mismatch" }),
        expect.objectContaining({ code: "stored_preview_hash_mismatch" }),
        expect.objectContaining({ code: "reviewed_payload_hash_mismatch" })
      ])
    });
    expect(output).not.toContain("shpat_page_review_secret");
    expect(context.audit.list()[1]).toMatchObject({ tool: "page.create.execute", result: "blocked" });
    expect(fetchCalled).toBe(false);
  });

  it("blocks page.create.execute before fetch when known granted scopes miss page write scope", async () => {
    let fetchCalled = false;
    const context = baseContext(async () => {
      fetchCalled = true;
      return jsonResponse({});
    }, false);
    context.config.grantedScopes = ["read_content", "shpat_scope_secret"];
    const preview = await callTool("page.create.preview", {
      title: "Care Guide",
      body: "Wash cold."
    }, context) as Record<string, unknown>;
    const binding = preview.binding as Record<string, unknown>;
    const reviewed = reviewedBindingFor(context, preview);

    const result = await callTool("page.create.execute", {
      previewId: preview.previewId,
      confirmed: true,
      reviewedPayload: reviewed.reviewedPayload,
      expectedTool: binding.expectedTool,
      target: binding.target,
      previewHash: preview.previewHash,
      reviewedChangesHash: reviewed.reviewedChangesHash
    }, context);
    const output = JSON.stringify(result);

    expect(result).toMatchObject({
      ok: false,
      mode: "execute",
      implemented: true,
      status: "blocked",
      diagnostics: expect.arrayContaining([expect.objectContaining({ code: "missing_write_scope" })])
    });
    expect(output).not.toContain("shpat_scope_secret");
    expect(context.audit.list()[1]).toMatchObject({ tool: "page.create.execute", result: "blocked" });
    expect(fetchCalled).toBe(false);
  });

  it("blocks page.create.execute before fetch when granted scopes are unknown", async () => {
    let fetchCalled = false;
    const context = baseContext(async () => {
      fetchCalled = true;
      return jsonResponse({});
    }, false);
    const preview = await callTool("page.create.preview", {
      title: "Care Guide",
      body: "Wash cold."
    }, context) as Record<string, unknown>;
    const binding = preview.binding as Record<string, unknown>;
    const reviewed = reviewedBindingFor(context, preview);

    const result = await callTool("page.create.execute", {
      previewId: preview.previewId,
      confirmed: true,
      reviewedPayload: reviewed.reviewedPayload,
      expectedTool: binding.expectedTool,
      target: binding.target,
      previewHash: preview.previewHash,
      reviewedChangesHash: reviewed.reviewedChangesHash
    }, context);

    expect(result).toMatchObject({
      ok: false,
      mode: "execute",
      implemented: true,
      status: "blocked",
      diagnostics: expect.arrayContaining([expect.objectContaining({ code: "unknown_write_scopes" })])
    });
    expect(context.audit.list()[1]).toMatchObject({ tool: "page.create.execute", result: "blocked" });
    expect(fetchCalled).toBe(false);
  });

  it("calls the Shopify pageCreate mutation only after valid stored preview binding", async () => {
    const requests: Array<{ body: string }> = [];
    const context = baseContext(async (_url, init) => {
      requests.push({ body: init.body });
      if (init.body.includes("ShopifyStoreAgentPageVerify")) {
        return jsonResponse({
          data: {
            node: { __typename: "Page", id: "gid://shopify/Page/1", title: "Care Guide", handle: "care-guide", rawVerifyNodeOnly: true }
          }
        });
      }
      return jsonResponse({
        data: {
          pageCreate: {
            page: { id: "gid://shopify/Page/1", title: "Care Guide", handle: "care-guide", rawNodeOnly: true },
            userErrors: []
          }
        }
      });
    }, false);
    context.config.grantedScopes = ["write_content"];
    const preview = await callTool("page.create.preview", {
      title: "Care Guide",
      body: "Wash cold.",
      handle: "care-guide",
      publishPreference: "draft"
    }, context) as Record<string, unknown>;
    const binding = preview.binding as Record<string, unknown>;
    const reviewed = reviewedBindingFor(context, preview);

    const result = await callTool("page.create.execute", {
      previewId: preview.previewId,
      confirmed: true,
      reviewedPayload: reviewed.reviewedPayload,
      expectedTool: binding.expectedTool,
      target: binding.target,
      previewHash: preview.previewHash,
      reviewedChangesHash: reviewed.reviewedChangesHash,
      body: "UNRELATED EXECUTE BODY"
    }, context);
    const createRequest = JSON.parse(requests[0].body);
    const verifyRequest = JSON.parse(requests[1].body);
    const output = JSON.stringify(result);

    expect(result).toMatchObject({
      ok: true,
      mode: "execute",
      implemented: true,
      status: "ok",
      createdPage: {
        id: "gid://shopify/Page/1",
        title: "Care Guide",
        handle: "care-guide"
      },
      verification: {
        ok: true,
        status: "verified",
        page: {
          id: "gid://shopify/Page/1"
        }
      }
    });
    expect(requests).toHaveLength(2);
    expect(createRequest.query).toContain("mutation ShopifyStoreAgentPageCreate");
    expect(createRequest.query).toContain("pageCreate");
    expect(createRequest.query).not.toContain("productCreate");
    expect(createRequest.query).not.toContain("collectionCreate");
    expect(createRequest.query).not.toContain("refundCreate");
    expect(createRequest.variables.page).toMatchObject({
      title: "Care Guide",
      body: "Wash cold.",
      handle: "care-guide",
      isPublished: false
    });
    expect(verifyRequest.query).toContain("query ShopifyStoreAgentPageVerify");
    expect(verifyRequest.variables).toEqual({ id: "gid://shopify/Page/1" });
    expect(requests[1].body).not.toContain("Product");
    expect(requests[1].body).not.toContain("Order");
    expect(requests[1].body).not.toContain("Customer");
    expect(requests[0].body).not.toContain("UNRELATED EXECUTE BODY");
    expect(output).not.toContain("rawNodeOnly");
    expect(output).not.toContain("rawVerifyNodeOnly");
    expect(output).not.toContain("Wash cold.");
    expect(context.audit.list()[1]).toMatchObject({ tool: "page.create.execute", result: "success" });
  });

  it("allows page.create.execute with write_online_store_pages granted scope", async () => {
    const requests: Array<{ body: string }> = [];
    const context = baseContext(async (_url, init) => {
      requests.push({ body: init.body });
      if (init.body.includes("ShopifyStoreAgentPageVerify")) {
        return jsonResponse({ data: { node: { __typename: "Page", id: "gid://shopify/Page/2", title: "Care Guide" } } });
      }
      return jsonResponse({
        data: {
          pageCreate: {
            page: { id: "gid://shopify/Page/2", title: "Care Guide", handle: "care-guide" },
            userErrors: []
          }
        }
      });
    }, false);
    context.config.grantedScopes = ["write_online_store_pages"];
    const preview = await callTool("page.create.preview", {
      title: "Care Guide",
      body: "Wash cold."
    }, context) as Record<string, unknown>;
    const binding = preview.binding as Record<string, unknown>;
    const reviewed = reviewedBindingFor(context, preview);

    const result = await callTool("page.create.execute", {
      previewId: preview.previewId,
      confirmed: true,
      reviewedPayload: reviewed.reviewedPayload,
      expectedTool: binding.expectedTool,
      target: binding.target,
      previewHash: preview.previewHash,
      reviewedChangesHash: reviewed.reviewedChangesHash
    }, context);

    expect(result).toMatchObject({ ok: true, mode: "execute", status: "ok" });
    expect(requests).toHaveLength(2);
  });

  it("returns safe page create verification warnings without raw dumps", async () => {
    const requests: Array<{ body: string }> = [];
    const context = baseContext(async (_url, init) => {
      requests.push({ body: init.body });
      if (init.body.includes("ShopifyStoreAgentPageVerify")) {
        return jsonResponse({
          data: {
            node: {
              __typename: "Product",
              id: "gid://shopify/Product/1",
              rawNodeOnly: "do not return"
            }
          }
        });
      }
      return jsonResponse({
        data: {
          pageCreate: {
            page: { id: "gid://shopify/Page/3", title: "Care Guide", handle: "care-guide" },
            userErrors: []
          }
        }
      });
    }, false);
    context.config.grantedScopes = ["write_content"];
    const preview = await callTool("page.create.preview", {
      title: "Care Guide",
      body: "Wash cold."
    }, context) as Record<string, unknown>;
    const binding = preview.binding as Record<string, unknown>;
    const reviewed = reviewedBindingFor(context, preview);

    const result = await callTool("page.create.execute", {
      previewId: preview.previewId,
      confirmed: true,
      reviewedPayload: reviewed.reviewedPayload,
      expectedTool: binding.expectedTool,
      target: binding.target,
      previewHash: preview.previewHash,
      reviewedChangesHash: reviewed.reviewedChangesHash
    }, context);
    const output = JSON.stringify(result);

    expect(result).toMatchObject({
      ok: true,
      mode: "execute",
      status: "ok",
      verification: {
        ok: false,
        status: "warning",
        diagnostics: [{ code: "page_verification_not_found" }]
      },
      diagnostics: [{ code: "page_verification_not_found" }]
    });
    expect(requests).toHaveLength(2);
    expect(requests[1].body).toContain("\"id\":\"gid://shopify/Page/3\"");
    expect(output).not.toContain("gid://shopify/Product/1");
    expect(output).not.toContain("rawNodeOnly");
    expect(context.audit.list()[1]).toMatchObject({ tool: "page.create.execute", result: "success" });
  });

  it("returns Shopify page create user errors safely", async () => {
    const context = baseContext(async () => jsonResponse({
      data: {
        pageCreate: {
          page: null,
          userErrors: [{ field: ["title"], message: "Title has already been taken." }]
        }
      }
    }), false);
    context.config.grantedScopes = ["write_content"];
    const preview = await callTool("page.create.preview", {
      title: "Care Guide",
      body: "Wash cold."
    }, context) as Record<string, unknown>;
    const binding = preview.binding as Record<string, unknown>;
    const reviewed = reviewedBindingFor(context, preview);

    const result = await callTool("page.create.execute", {
      previewId: preview.previewId,
      confirmed: true,
      reviewedPayload: reviewed.reviewedPayload,
      expectedTool: binding.expectedTool,
      target: binding.target,
      previewHash: preview.previewHash,
      reviewedChangesHash: reviewed.reviewedChangesHash
    }, context);

    expect(result).toMatchObject({
      ok: false,
      mode: "execute",
      implemented: true,
      status: "user_errors",
      userErrors: [{ field: ["title"], message: "Title has already been taken." }]
    });
    expect(context.audit.list()[1]).toMatchObject({ tool: "page.create.execute", result: "blocked" });
  });

  it("returns safe failed audit for page.create.execute network errors", async () => {
    const context = baseContext(async () => {
      throw new Error("network failed with token shpat_page_execute_secret");
    }, false);
    context.config.grantedScopes = ["write_content"];
    const preview = await callTool("page.create.preview", {
      title: "Care Guide",
      body: "Wash cold."
    }, context) as Record<string, unknown>;
    const binding = preview.binding as Record<string, unknown>;
    const reviewed = reviewedBindingFor(context, preview);

    const result = await callTool("page.create.execute", {
      previewId: preview.previewId,
      confirmed: true,
      reviewedPayload: reviewed.reviewedPayload,
      expectedTool: binding.expectedTool,
      target: binding.target,
      previewHash: preview.previewHash,
      reviewedChangesHash: reviewed.reviewedChangesHash
    }, context);
    const output = JSON.stringify(result);

    expect(result).toMatchObject({
      ok: false,
      mode: "execute",
      implemented: true,
      status: "shopify_error",
      diagnostics: [{ code: "shopify_request_failed" }]
    });
    expect(output).not.toContain("shpat_page_execute_secret");
    expect(context.audit.list()[1]).toMatchObject({ tool: "page.create.execute", result: "failed" });
  });

  it("blocks collection.create.execute in read-only mode before fetch", async () => {
    let fetchCalled = false;
    const context = baseContext(async () => {
      fetchCalled = true;
      return jsonResponse({});
    });
    context.config.grantedScopes = ["write_products"];
    const preview = await callTool("collection.create.preview", {
      title: "Summer Picks",
      productIds: ["gid://shopify/Product/1"]
    }, context) as Record<string, unknown>;
    const binding = preview.binding as Record<string, unknown>;
    const reviewed = reviewedBindingFor(context, preview);

    const result = await callTool("collection.create.execute", {
      previewId: preview.previewId,
      confirmed: true,
      reviewedPayload: reviewed.reviewedPayload,
      expectedTool: binding.expectedTool,
      target: binding.target,
      previewHash: preview.previewHash,
      reviewedChangesHash: reviewed.reviewedChangesHash
    }, context);

    expect(result).toMatchObject({
      ok: false,
      mode: "execute",
      implemented: true,
      status: "blocked",
      diagnostics: [{ code: "read_only" }]
    });
    expect(context.audit.list()[1]).toMatchObject({ tool: "collection.create.execute", result: "blocked" });
    expect(fetchCalled).toBe(false);
  });

  it("blocks collection.create.execute before fetch when write_products is missing", async () => {
    let fetchCalled = false;
    const context = baseContext(async () => {
      fetchCalled = true;
      return jsonResponse({});
    }, false);
    context.config.grantedScopes = ["read_products", "shpat_scope_secret"];
    const preview = await callTool("collection.create.preview", {
      title: "Summer Picks",
      productIds: ["gid://shopify/Product/1"]
    }, context) as Record<string, unknown>;
    const binding = preview.binding as Record<string, unknown>;
    const reviewed = reviewedBindingFor(context, preview);

    const result = await callTool("collection.create.execute", {
      previewId: preview.previewId,
      confirmed: true,
      reviewedPayload: reviewed.reviewedPayload,
      expectedTool: binding.expectedTool,
      target: binding.target,
      previewHash: preview.previewHash,
      reviewedChangesHash: reviewed.reviewedChangesHash
    }, context);
    const output = JSON.stringify(result);

    expect(result).toMatchObject({
      ok: false,
      mode: "execute",
      implemented: true,
      status: "blocked",
      diagnostics: expect.arrayContaining([expect.objectContaining({ code: "missing_write_scope" })])
    });
    expect(output).not.toContain("shpat_scope_secret");
    expect(context.audit.list()[1]).toMatchObject({ tool: "collection.create.execute", result: "blocked" });
    expect(fetchCalled).toBe(false);
  });

  it("blocks rule-based collection.create.execute because smart collections are not implemented", async () => {
    let fetchCalled = false;
    const context = baseContext(async () => {
      fetchCalled = true;
      return jsonResponse({});
    }, false);
    context.config.grantedScopes = ["write_products"];
    const preview = await callTool("collection.create.preview", {
      title: "Tagged Products",
      rules: [{ column: "TAG", relation: "EQUALS", condition: "summer" }]
    }, context) as Record<string, unknown>;
    const binding = preview.binding as Record<string, unknown>;
    const reviewed = reviewedBindingFor(context, preview);

    const result = await callTool("collection.create.execute", {
      previewId: preview.previewId,
      confirmed: true,
      reviewedPayload: reviewed.reviewedPayload,
      expectedTool: binding.expectedTool,
      target: binding.target,
      previewHash: preview.previewHash,
      reviewedChangesHash: reviewed.reviewedChangesHash
    }, context);

    expect(result).toMatchObject({
      ok: false,
      mode: "execute",
      implemented: true,
      status: "blocked",
      diagnostics: expect.arrayContaining([expect.objectContaining({ code: "unsupported_collection_rules" })])
    });
    expect(context.audit.list()[1]).toMatchObject({ tool: "collection.create.execute", result: "blocked" });
    expect(fetchCalled).toBe(false);
  });

  it("calls collectionCreate after valid stored preview binding and write_products preflight", async () => {
    const requests: Array<{ body: string }> = [];
    const context = baseContext(async (_url, init) => {
      requests.push({ body: init.body });
      return jsonResponse({
        data: {
          collectionCreate: {
            collection: {
              id: "gid://shopify/Collection/1",
              title: "Summer Picks",
              handle: "summer-picks",
              rawNodeOnly: "do not return"
            },
            userErrors: []
          }
        }
      });
    }, false);
    context.config.grantedScopes = ["write_products"];
    const preview = await callTool("collection.create.preview", {
      title: "Summer Picks",
      handle: "summer-picks",
      productIds: ["gid://shopify/Product/1", "gid://shopify/Product/2"],
      seo: { title: "ignored" },
      publishPreference: "published"
    }, context) as Record<string, unknown>;
    const binding = preview.binding as Record<string, unknown>;
    const reviewed = reviewedBindingFor(context, preview);

    const result = await callTool("collection.create.execute", {
      previewId: preview.previewId,
      confirmed: true,
      reviewedPayload: reviewed.reviewedPayload,
      expectedTool: binding.expectedTool,
      target: binding.target,
      previewHash: preview.previewHash,
      reviewedChangesHash: reviewed.reviewedChangesHash,
      title: "UNRELATED EXECUTE TITLE",
      productIds: ["gid://shopify/Product/999"]
    }, context);
    expect(result).toMatchObject({ ok: true, diagnostics: [] });
    const request = JSON.parse(requests[0].body);
    const output = JSON.stringify(result);

    expect(result).toMatchObject({
      ok: true,
      mode: "execute",
      implemented: true,
      status: "ok",
      createdCollection: {
        id: "gid://shopify/Collection/1",
        title: "Summer Picks",
        handle: "summer-picks"
      }
    });
    expect(requests).toHaveLength(1);
    expect(request.query).toContain("mutation ShopifyStoreAgentCollectionCreate");
    expect(request.query).toContain("collectionCreate");
    expect(request.query).not.toContain("productCreate");
    expect(request.query).not.toContain("productUpdate");
    expect(request.query).not.toContain("pageCreate");
    expect(request.query).not.toContain("refundCreate");
    expect(request.variables.collection).toEqual({
      title: "Summer Picks",
      handle: "summer-picks",
      sources: [{
        source: {
          title: "Summer Picks product selections",
          inclusion: {
            selections: [
              { productId: "gid://shopify/Product/1" },
              { productId: "gid://shopify/Product/2" }
            ]
          }
        }
      }]
    });
    expect(request.variables.collection).not.toHaveProperty("seo");
    expect(request.variables.collection).not.toHaveProperty("publishPreference");
    expect(requests[0].body).not.toContain("UNRELATED EXECUTE TITLE");
    expect(requests[0].body).not.toContain("gid://shopify/Product/999");
    expect(output).not.toContain("rawNodeOnly");
    expect(context.audit.list()[1]).toMatchObject({ tool: "collection.create.execute", result: "success" });
  });

  it("keeps catalog and content execute tools not implemented without calling fetchers", async () => {
    let fetchCalled = false;
    const context = baseContext(async () => {
      fetchCalled = true;
      return {
        ok: true,
        status: 200,
        async text() {
          return "{}";
        }
      };
    }, false);
    const executeCalls: Array<[string, Record<string, unknown>]> = [
      ["product.media.update.execute", { ...executeBinding("product.media.update.preview", "gid://shopify/Product/1"), productId: "gid://shopify/Product/1", confirmed: true }],
      ["product.importFromUserUrl.execute", { ...executeBinding("product.importFromUserUrl.preview", "https://example.com/products/shirt"), url: "https://example.com/products/shirt", confirmed: true }]
    ];

    for (const [tool, input] of executeCalls) {
      const result = await callTool(tool, input, context);
      expect(result).toMatchObject({
        ok: false,
        mode: "execute",
        implemented: false,
        status: "not_implemented",
        placeholder: true
      });
    }

    expect(fetchCalled).toBe(false);
    expect(context.audit.list()).toHaveLength(executeCalls.length);
    expect(context.audit.list().every((entry) => entry.result === "not_implemented")).toBe(true);
  });

  it("keeps remaining execute tools not implemented with valid preview binding", async () => {
    let fetchCalled = false;
    const context = baseContext(async () => {
      fetchCalled = true;
      return jsonResponse({});
    }, false);
    const executeCalls: Array<[string, Record<string, unknown>]> = [
      ["customer.updateAddress.execute", { ...executeBinding("customer.updateAddress.preview", "gid://shopify/Customer/1"), customerId: "gid://shopify/Customer/1", confirmed: true }],
      ["tracking.update.execute", { ...executeBinding("tracking.update.preview", "gid://shopify/Fulfillment/1"), fulfillmentId: "gid://shopify/Fulfillment/1", confirmed: true }],
      ["bulk.execute", { ...executeBinding("bulk.preview", "preview_123"), confirmed: true }]
    ];

    for (const [tool, input] of executeCalls) {
      const result = await callTool(tool, input, context);
      expect(result).toMatchObject({
        ok: false,
        mode: "execute",
        implemented: false,
        status: "not_implemented",
        placeholder: true
      });
    }

    expect(fetchCalled).toBe(false);
    expect(context.audit.list()).toHaveLength(executeCalls.length);
    expect(context.audit.list().every((entry) => entry.result === "not_implemented")).toBe(true);
  });

  it("keeps refund execute as a not-implemented placeholder with idempotency context", async () => {
    const context: ToolContext = {
      config: createConfig({ storeUrl: "demo", readOnly: false }),
      audit: new MemoryAuditLog()
    };

    const result = await callTool("refund.execute", {
      ...executeBinding("refund.preview", "gid://shopify/Order/1"),
      orderId: "gid://shopify/Order/1",
      idempotencyKey: "refund-key-1",
      confirmed: true
    }, context);

    expect(result).toMatchObject({
      ok: false,
      mode: "execute",
      implemented: false,
      status: "not_implemented",
      placeholder: true,
      idempotencyKey: "refund-key-1"
    });
  });

  it("blocks and redacts secret-looking execute binding control values from output and audit", async () => {
    const context: ToolContext = {
      config: createConfig({ storeUrl: "demo", readOnly: false }),
      audit: new MemoryAuditLog()
    };

    const result = await callTool("product.importFromUserUrl.execute", {
      previewId: "preview_shpat_execute_secret",
      confirmed: true,
      expectedTool: "product.importFromUserUrl.preview",
      target: "https://example.com/products/shirt?access_token=shpat_execute_secret",
      previewHash: "hash-a",
      reviewedChangesHash: "hash-a",
      reviewedPayload: { token: "shpat_execute_secret" },
      url: "https://example.com/products/shirt?access_token=shpat_execute_secret"
    }, context);
    const output = JSON.stringify(result);

    expect(result).toMatchObject({
      ok: false,
      mode: "execute",
      status: "blocked",
      diagnostics: expect.arrayContaining([
        expect.objectContaining({ code: "invalid_secret_like_preview_id" }),
        expect.objectContaining({ code: "target_mismatch" })
      ])
    });
    expect(output).not.toContain("shpat_execute_secret");
    expect(context.audit.list()[0].target).not.toContain("shpat_execute_secret");
    expect(context.audit.list()[0]).toMatchObject({ result: "blocked" });
  });

  it("keeps theme apply binding guards before not implemented", async () => {
    const context: ToolContext = {
      config: createConfig({ storeUrl: "demo", readOnly: false }),
      audit: new MemoryAuditLog()
    };

    const missing = await callTool("theme.apply", { confirmed: true }, context);

    expect(missing).toMatchObject({
      ok: false,
      mode: "execute",
      implemented: false,
      status: "blocked",
      diagnostics: expect.arrayContaining([
        expect.objectContaining({ code: "missing_preview_id" }),
        expect.objectContaining({ code: "missing_reviewed_payload" })
      ])
    });
    expect(context.audit.list()[0]).toMatchObject({ tool: "theme.apply", mode: "execute", result: "blocked" });

    const result = await callTool("theme.apply", {
      ...executeBinding("theme.preview", "preview-1"),
      previewId: "preview-1",
      confirmed: true
    }, context);

    expect(result).toMatchObject({
      ok: false,
      mode: "execute",
      implemented: false,
      status: "not_implemented",
      placeholder: true,
      previewId: "preview-1"
    });
    expect(context.audit.list()[1]).toMatchObject({ tool: "theme.apply", mode: "execute", result: "not_implemented" });
  });
});

function readContext(responseBody: unknown): ToolContext {
  return {
    config: createConfig({
      storeUrl: "demo",
      adminAccessToken: "shpat_test_secret",
      readOnly: true
    }),
    audit: new MemoryAuditLog(),
    fetcher: async () => ({
      ok: true,
      status: 200,
      async text() {
        return JSON.stringify(responseBody);
      }
    })
  };
}

function baseContext(fetcher?: ToolContext["fetcher"], readOnly = true): ToolContext {
  return {
    config: createConfig({
      storeUrl: "demo",
      adminAccessToken: "shpat_test_secret",
      readOnly
    }),
    audit: new MemoryAuditLog(),
    fetcher
  };
}

function jsonResponse(body: unknown): ReturnType<NonNullable<ToolContext["fetcher"]>> extends Promise<infer Response> ? Response : never {
  return {
    ok: true,
    status: 200,
    async text() {
      return JSON.stringify(body);
    }
  };
}

function restoreEnv(key: string, value: string | undefined): void {
  if (value === undefined) {
    delete process.env[key];
  } else {
    process.env[key] = value;
  }
}

function changeFor(result: unknown, field: string): Record<string, unknown> | undefined {
  if (!result || typeof result !== "object" || !("proposedChanges" in result)) return undefined;
  const changes = (result as { proposedChanges: unknown }).proposedChanges;
  if (!Array.isArray(changes)) return undefined;
  return changes.find((change): change is Record<string, unknown> => Boolean(change) && typeof change === "object" && (change as { field?: unknown }).field === field);
}

function executeBinding(expectedTool: string, target: string): Record<string, unknown> {
  return {
    previewId: "preview_123",
    expectedTool,
    target,
    previewHash: "reviewed_hash_123",
    reviewedChangesHash: "reviewed_hash_123",
    reviewedPayload: { reviewed: true }
  };
}

function reviewedBindingFor(context: ToolContext, preview: Record<string, unknown>): { reviewedPayload: unknown; reviewedChangesHash: string } {
  const lookup = context.previewStore?.getPreview(preview.previewId);
  if (!lookup?.record) throw new Error("Expected preview to be stored for test");
  const reviewedPayload = reviewedPayloadForPreviewRecord(lookup.record);
  return {
    reviewedPayload,
    reviewedChangesHash: hashPreviewContent(reviewedPayload)
  };
}
