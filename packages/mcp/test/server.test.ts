import { describe, expect, it } from "vitest";
import { createShopifyStoreAgentServer } from "../src/server.js";

describe("MCP server", () => {
  it("creates an SDK-backed MCP server", async () => {
    const server = await createShopifyStoreAgentServer();
    expect(server).toBeTruthy();
  });
});
