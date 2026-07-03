import { describe, expect, it } from "vitest";
import { createShopifyStoreAgentServer } from "../src/server.js";
import { listTools } from "../src/tools.js";

describe("MCP server", () => {
  it("creates an SDK-backed MCP server and exposes tools", async () => {
    const server = await createShopifyStoreAgentServer();
    const tools = listTools();

    expect(server).toBeTruthy();
    expect(tools.map((tool) => tool.name)).toContain("product.create");
    expect(tools.map((tool) => tool.name)).toContain("theme.apply");
  });
});
