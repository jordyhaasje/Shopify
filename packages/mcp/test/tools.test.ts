import { describe, expect, it } from "vitest";
import { createConfig, hashPreviewContent, reviewedPayloadForPreviewRecord } from "@shopify-store-agent/core";
import { callTool, listTools, type ToolContext } from "../src/tools.js";
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
    expect(context.previewStore?.getPreview((result as { previewId: string }).previewId)).toMatchObject({
      ok: true,
      record: {
        tool: "product.create.preview",
        previewHash: (result as { previewHash: string }).previewHash
      }
    });
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
    }

    expect(fetchCalled).toBe(false);
  });

  it("keeps preview output free of secrets and raw oversized payload dumps", async () => {
    const context = baseContext();
    const result = await callTool("page.create.preview", {
      title: "Large Page",
      body: `shpat_test_secret ${"Long content ".repeat(1000)}`,
      seo: { token: "shpat_test_secret" }
    }, context);
    const output = JSON.stringify(result);

    expect(result).toMatchObject({ ok: true, mode: "preview", status: "ok" });
    expect(output).not.toContain("shpat_test_secret");
    expect(output.length).toBeLessThan(3500);
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

  it("blocks writes in read-only mode", async () => {
    const context: ToolContext = {
      config: createConfig({ storeUrl: "demo", readOnly: true }),
      audit: new MemoryAuditLog()
    };

    await expect(callTool("product.create.execute", {
      ...executeBinding("product.create.preview", "Test product"),
      confirmed: true,
      title: "Test product"
    }, context)).rejects.toThrow("read-only");
  });

  it("blocks execute without explicit confirmation", async () => {
    const context: ToolContext = {
      config: createConfig({ storeUrl: "demo", readOnly: false }),
      audit: new MemoryAuditLog()
    };

    const result = await callTool("product.create.execute", {
      ...executeBinding("product.create.preview", "Test product"),
      title: "Test product"
    }, context);

    expect(result).toMatchObject({
      ok: false,
      mode: "execute",
      implemented: false,
      status: "blocked",
      placeholder: true,
      diagnostics: expect.arrayContaining([
        expect.objectContaining({ code: "missing_confirmation" })
      ])
    });
    expect(context.audit.list()[0]).toMatchObject({
      tool: "product.create.execute",
      mode: "execute",
      result: "blocked"
    });
  });

  it("blocks execute without previewId", async () => {
    const context: ToolContext = {
      config: createConfig({ storeUrl: "demo", readOnly: false }),
      audit: new MemoryAuditLog()
    };

    const result = await callTool("product.create.execute", {
      confirmed: true,
      reviewedPayload: { title: "Test product" },
      expectedTool: "product.create.preview",
      target: "Test product",
      title: "Test product"
    }, context);

    expect(result).toMatchObject({
      ok: false,
      mode: "execute",
      implemented: false,
      status: "blocked",
      placeholder: true,
      diagnostics: expect.arrayContaining([
        expect.objectContaining({ code: "missing_preview_id" })
      ])
    });
    expect(context.audit.list()[0]).toMatchObject({ result: "blocked" });
  });

  it("blocks execute with confirmation but missing reviewed payload", async () => {
    const context: ToolContext = {
      config: createConfig({ storeUrl: "demo", readOnly: false }),
      audit: new MemoryAuditLog()
    };

    const result = await callTool("product.update.execute", {
      confirmed: true,
      previewId: "preview_123",
      expectedTool: "product.update.preview",
      productId: "gid://shopify/Product/1"
    }, context);

    expect(result).toMatchObject({
      ok: false,
      mode: "execute",
      implemented: false,
      status: "blocked",
      diagnostics: expect.arrayContaining([
        expect.objectContaining({ code: "missing_reviewed_payload" })
      ])
    });
    expect(context.audit.list()[0]).toMatchObject({ tool: "product.update.execute", result: "blocked" });
  });

  it("blocks execute with previewId, confirmation, and payload but missing binding context", async () => {
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
      implemented: false,
      status: "blocked",
      placeholder: true,
      diagnostics: expect.arrayContaining([
        expect.objectContaining({ code: "missing_expected_tool" }),
        expect.objectContaining({ code: "missing_target" }),
        expect.objectContaining({ code: "missing_preview_hash" }),
        expect.objectContaining({ code: "missing_reviewed_changes_hash" })
      ])
    });
    expect(context.audit.list()[0]).toMatchObject({
      tool: "product.create.execute",
      mode: "execute",
      result: "blocked"
    });
  });

  it("blocks execute when preview binding expected tool mismatches", async () => {
    const context: ToolContext = {
      config: createConfig({ storeUrl: "demo", readOnly: false }),
      audit: new MemoryAuditLog()
    };

    const result = await callTool("product.update.execute", {
      ...executeBinding("product.create.preview", "gid://shopify/Product/1"),
      confirmed: true,
      productId: "gid://shopify/Product/1"
    }, context);

    expect(result).toMatchObject({
      ok: false,
      mode: "execute",
      status: "blocked",
      diagnostics: expect.arrayContaining([
        expect.objectContaining({ code: "preview_tool_mismatch" })
      ])
    });
    expect(context.audit.list()[0]).toMatchObject({ result: "blocked" });
  });

  it("blocks execute with secret-looking mismatched hashes without leaking them", async () => {
    const context: ToolContext = {
      config: createConfig({ storeUrl: "demo", readOnly: false }),
      audit: new MemoryAuditLog()
    };

    const result = await callTool("product.update.execute", {
      previewId: "preview_123",
      confirmed: true,
      reviewedPayload: { reviewed: true },
      expectedTool: "product.update.preview",
      target: "gid://shopify/Product/1",
      previewHash: "shpat_hash_a",
      reviewedChangesHash: "shpat_hash_b",
      productId: "gid://shopify/Product/1"
    }, context);
    const output = JSON.stringify(result);

    expect(result).toMatchObject({
      ok: false,
      mode: "execute",
      implemented: false,
      status: "blocked",
      placeholder: true,
      diagnostics: expect.arrayContaining([
        expect.objectContaining({ code: "invalid_secret_like_hash" }),
        expect.objectContaining({ code: "preview_hash_mismatch" })
      ])
    });
    expect(output).not.toContain("shpat_hash_a");
    expect(output).not.toContain("shpat_hash_b");
    expect(context.audit.list()[0]).toMatchObject({
      tool: "product.update.execute",
      mode: "execute",
      result: "blocked"
    });
  });

  it("reports validly bound execute placeholders as not implemented", async () => {
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

    const result = await callTool("product.create.execute", {
      ...executeBinding("product.create.preview", "Test product"),
      title: "Test product",
      confirmed: true
    }, context);

    expect(result).toMatchObject({
      ok: false,
      mode: "execute",
      implemented: false,
      status: "not_implemented",
      placeholder: true,
      previewBinding: {
        previewId: "preview_123",
        expectedTool: "product.create.preview",
        target: "Test product"
      }
    });
    expect(JSON.stringify(result)).toContain("No Shopify change was made");
    expect(JSON.stringify(result)).not.toContain("mutation");
    expect(context.audit.list()[0]).toMatchObject({
      tool: "product.create.execute",
      mode: "execute",
      result: "not_implemented"
    });
    expect(fetchCalled).toBe(false);
  });

  it("uses a stored preview binding to keep execute placeholders not implemented", async () => {
    const context = baseContext(undefined, false);
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
      reviewedChangesHash: reviewed.reviewedChangesHash,
      title: "Stored Preview Shirt"
    }, context);

    expect(result).toMatchObject({
      ok: false,
      mode: "execute",
      implemented: false,
      status: "not_implemented",
      placeholder: true
    });
    expect(context.audit.list()[1]).toMatchObject({
      tool: "product.create.execute",
      mode: "execute",
      result: "not_implemented"
    });
  });

  it("blocks stored preview execute when reviewed payload does not match", async () => {
    const context = baseContext(undefined, false);
    const preview = await callTool("product.create.preview", {
      title: "Mismatch Preview Shirt",
      description: "A reviewed product."
    }, context) as Record<string, unknown>;
    const binding = preview.binding as Record<string, unknown>;

    const result = await callTool("product.create.execute", {
      previewId: preview.previewId,
      confirmed: true,
      reviewedPayload: { title: "Different reviewed payload" },
      expectedTool: binding.expectedTool,
      target: binding.target,
      previewHash: preview.previewHash,
      reviewedChangesHash: hashPreviewContent({ title: "Different reviewed payload" }),
      title: "Mismatch Preview Shirt"
    }, context);

    expect(result).toMatchObject({
      ok: false,
      mode: "execute",
      implemented: false,
      status: "blocked",
      placeholder: true,
      diagnostics: expect.arrayContaining([expect.objectContaining({ code: "reviewed_payload_hash_mismatch" })])
    });
    expect(context.audit.list()[1]).toMatchObject({
      tool: "product.create.execute",
      mode: "execute",
      result: "blocked"
    });
  });

  it("blocks arbitrary reviewed payload even when preview hash is copied", async () => {
    let fetchCalled = false;
    const context = baseContext(async () => {
      fetchCalled = true;
      return jsonResponse({});
    }, false);
    const preview = await callTool("product.create.preview", {
      title: "Copied Hash Shirt",
      description: "A reviewed product."
    }, context) as Record<string, unknown>;
    const binding = preview.binding as Record<string, unknown>;

    const result = await callTool("product.create.execute", {
      previewId: preview.previewId,
      confirmed: true,
      reviewedPayload: { arbitrary: "payload", token: "shpat_arbitrary_review_secret" },
      expectedTool: binding.expectedTool,
      target: binding.target,
      previewHash: preview.previewHash,
      reviewedChangesHash: preview.previewHash,
      title: "Copied Hash Shirt"
    }, context);
    const output = JSON.stringify(result);

    expect(result).toMatchObject({
      ok: false,
      mode: "execute",
      status: "blocked",
      diagnostics: expect.arrayContaining([
        expect.objectContaining({ code: "reviewed_payload_hash_mismatch" }),
        expect.objectContaining({ code: "reviewed_changes_hash_mismatch" })
      ])
    });
    expect(output).not.toContain("shpat_arbitrary_review_secret");
    expect(context.audit.list()[1]).toMatchObject({
      tool: "product.create.execute",
      mode: "execute",
      result: "blocked"
    });
    expect(fetchCalled).toBe(false);
  });

  it("blocks expired stored preview binding before execute placeholder flow", async () => {
    const context = baseContext(undefined, false);
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
      reviewedChangesHash: reviewed.reviewedChangesHash,
      title: "Expired Preview Shirt"
    }, context);

    expect(result).toMatchObject({
      ok: false,
      mode: "execute",
      implemented: false,
      status: "blocked",
      placeholder: true,
      diagnostics: expect.arrayContaining([expect.objectContaining({ code: "stored_preview_expired" })])
    });
    expect(context.audit.list()[1]).toMatchObject({
      tool: "product.create.execute",
      mode: "execute",
      result: "blocked"
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
      ["product.create.execute", { ...executeBinding("product.create.preview", "Linen Shirt"), title: "Linen Shirt", confirmed: true }],
      ["product.update.execute", { ...executeBinding("product.update.preview", "gid://shopify/Product/1"), productId: "gid://shopify/Product/1", confirmed: true }],
      ["product.media.update.execute", { ...executeBinding("product.media.update.preview", "gid://shopify/Product/1"), productId: "gid://shopify/Product/1", confirmed: true }],
      ["product.importFromUserUrl.execute", { ...executeBinding("product.importFromUserUrl.preview", "https://example.com/products/shirt"), url: "https://example.com/products/shirt", confirmed: true }],
      ["collection.create.execute", { ...executeBinding("collection.create.preview", "Summer"), title: "Summer", confirmed: true }]
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
