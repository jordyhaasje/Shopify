import { describe, expect, it } from "vitest";
import { createConfig } from "@shopify-store-agent/core";
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

  it("blocks theme apply without confirmation", async () => {
    const context: ToolContext = {
      config: createConfig({ storeUrl: "demo", readOnly: false }),
      audit: new MemoryAuditLog()
    };

    await expect(callTool("theme.apply", { previewId: "preview-1" }, context)).rejects.toThrow("confirmation");
  });

  it("blocks writes in read-only mode", async () => {
    const context: ToolContext = {
      config: createConfig({ storeUrl: "demo", readOnly: true }),
      audit: new MemoryAuditLog()
    };

    await expect(callTool("product.create.execute", { confirmed: true }, context)).rejects.toThrow("read-only");
  });

  it("reports confirmed execute placeholders as not implemented", async () => {
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

    const result = await callTool("product.create.execute", { title: "Test product", confirmed: true }, context);

    expect(result).toMatchObject({
      ok: false,
      mode: "execute",
      implemented: false,
      status: "not_implemented",
      placeholder: true
    });
    expect(JSON.stringify(result)).toContain("No Shopify change was made");
    expect(context.audit.list()[0]).toMatchObject({
      tool: "product.create.execute",
      mode: "execute",
      result: "not_implemented"
    });
    expect(fetchCalled).toBe(false);
  });

  it("keeps refund execute as a not-implemented placeholder with idempotency context", async () => {
    const context: ToolContext = {
      config: createConfig({ storeUrl: "demo", readOnly: false }),
      audit: new MemoryAuditLog()
    };

    const result = await callTool("refund.execute", {
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

  it("keeps theme apply preview and confirmation guards before not implemented", async () => {
    const context: ToolContext = {
      config: createConfig({ storeUrl: "demo", readOnly: false }),
      audit: new MemoryAuditLog()
    };

    await expect(callTool("theme.apply", { confirmed: true }, context)).rejects.toThrow("preview ID");

    const result = await callTool("theme.apply", { previewId: "preview-1", confirmed: true }, context);

    expect(result).toMatchObject({
      ok: false,
      mode: "execute",
      implemented: false,
      status: "not_implemented",
      placeholder: true,
      previewId: "preview-1"
    });
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
