import { describe, expect, it } from "vitest";
import { handleRequest } from "../src/server.js";

describe("MCP server", () => {
  it("handles initialize and tools/list", async () => {
    await expect(handleRequest({ method: "initialize" })).resolves.toMatchObject({
      serverInfo: { name: "shopify-store-agent-mcp" }
    });

    const result = await handleRequest({ method: "tools/list" });
    expect(JSON.stringify(result)).toContain("product.create");
  });
});
