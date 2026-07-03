import { describe, expect, it } from "vitest";
import { createConfig } from "@shopify-store-agent/core";
import { callTool, listTools, type ToolContext } from "../src/tools.js";
import { MemoryAuditLog } from "@shopify-store-agent/core";

describe("MCP tools", () => {
  it("lists v1 tool groups", () => {
    const names = listTools().map((tool) => tool.name);
    expect(names).toContain("product.create");
    expect(names).toContain("refund.preview");
    expect(names).toContain("theme.apply");
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

    await expect(callTool("refund.execute", { confirmed: true }, context)).rejects.toThrow("read-only");
  });
});
