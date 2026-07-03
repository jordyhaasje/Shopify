import { describe, expect, it } from "vitest";
import { createConfig } from "../src/config.js";
import { ShopifyGraphqlClient } from "../src/shopify-client.js";

describe("ShopifyGraphqlClient", () => {
  it("sends GraphQL requests to the configured store", async () => {
    const client = new ShopifyGraphqlClient(createConfig({
      storeUrl: "demo.myshopify.com",
      adminAccessToken: "token"
    }), async (url, init) => {
      expect(url).toBe("https://demo.myshopify.com/admin/api/2026-07/graphql.json");
      expect(init.headers["X-Shopify-Access-Token"]).toBe("token");
      expect(JSON.parse(init.body)).toEqual({ query: "{ shop { name } }", variables: {} });
      return {
        ok: true,
        status: 200,
        async text() {
          return JSON.stringify({ data: { shop: { name: "Demo" } } });
        }
      };
    });

    await expect(client.request({ query: "{ shop { name } }" })).resolves.toEqual({
      data: { shop: { name: "Demo" } }
    });
  });
});
