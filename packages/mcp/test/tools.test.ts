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
    const context: ToolContext = {
      config: createConfig({ storeUrl: "demo", readOnly: false }),
      audit: new MemoryAuditLog()
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
