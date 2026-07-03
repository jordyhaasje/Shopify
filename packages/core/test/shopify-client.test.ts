import { describe, expect, it } from "vitest";
import { createConfig } from "../src/config.js";
import { collectUserErrors, ShopifyGraphqlClient, type FetchLike } from "../src/shopify-client.js";

function jsonResponse(status: number, body: unknown) {
  return {
    ok: status >= 200 && status < 300,
    status,
    async text() {
      return JSON.stringify(body);
    }
  };
}

describe("ShopifyGraphqlClient", () => {
  it("builds the Admin GraphQL endpoint and sends the token header", async () => {
    const client = new ShopifyGraphqlClient(createConfig({
      storeUrl: "demo.myshopify.com",
      adminAccessToken: "shpat_test_secret"
    }), async (url, init) => {
      expect(url).toBe("https://demo.myshopify.com/admin/api/2026-07/graphql.json");
      expect(init.method).toBe("POST");
      expect(init.headers["X-Shopify-Access-Token"]).toBe("shpat_test_secret");
      expect(init.headers["Content-Type"]).toBe("application/json");
      expect(JSON.parse(init.body)).toEqual({ query: "{ shop { name } }", variables: {} });
      return jsonResponse(200, { data: { shop: { name: "Demo" } } });
    });

    await expect(client.request<{ shop: { name: string } }>({ query: "{ shop { name } }" })).resolves.toMatchObject({
      ok: true,
      data: { shop: { name: "Demo" } },
      userErrors: []
    });
  });

  it("returns a safe structured error when the token is missing", async () => {
    const client = new ShopifyGraphqlClient(createConfig({ storeUrl: "demo" }));

    const result = await client.request({ query: "{ shop { name } }" });

    expect(result).toMatchObject({
      ok: false,
      error: {
        type: "missing_token",
        message: "Missing Shopify Admin API token."
      }
    });
  });

  it("returns a safe structured error for an invalid store URL", async () => {
    const client = new ShopifyGraphqlClient({
      storeUrl: " ",
      adminAccessToken: "token",
      apiVersion: "2026-07",
      readOnly: true
    });

    const result = await client.request({ query: "{ shop { name } }" });

    expect(result).toMatchObject({
      ok: false,
      error: {
        type: "invalid_store",
        message: "Invalid or missing Shopify store URL."
      }
    });
  });

  it("handles HTTP failures without exposing the token", async () => {
    const token = "shpat_never_expose";
    const client = new ShopifyGraphqlClient(createConfig({
      storeUrl: "demo",
      adminAccessToken: token
    }), async () => jsonResponse(403, { errors: "Access denied" }));

    const result = await client.request({ query: "{ shop { name } }" });

    expect(result.ok).toBe(false);
    expect(JSON.stringify(result)).not.toContain(token);
    expect(result).toMatchObject({
      error: {
        type: "access_denied",
        status: 403,
        accessDenied: true
      }
    });
  });

  it("handles non-JSON responses safely", async () => {
    const client = new ShopifyGraphqlClient(createConfig({
      storeUrl: "demo",
      adminAccessToken: "token"
    }), async () => ({
      ok: false,
      status: 502,
      async text() {
        return "<html>bad gateway</html>";
      }
    }));

    const result = await client.request({ query: "{ shop { name } }" });

    expect(result).toMatchObject({
      ok: false,
      status: 502,
      error: {
        type: "non_json"
      }
    });
    expect(JSON.stringify(result)).not.toContain("<html>");
  });

  it("handles GraphQL errors and detects access denial", async () => {
    const client = new ShopifyGraphqlClient(createConfig({
      storeUrl: "demo",
      adminAccessToken: "token"
    }), async () => jsonResponse(200, {
      errors: [
        { message: "Access denied for products field.", extensions: { code: "ACCESS_DENIED" } }
      ]
    }));

    const result = await client.request({ query: "{ products(first: 1) { nodes { id } } }" });

    expect(result).toMatchObject({
      ok: false,
      status: 200,
      error: {
        type: "access_denied",
        accessDenied: true,
        graphQLErrors: [{ message: "Access denied for products field.", code: "ACCESS_DENIED" }]
      }
    });
  });

  it("collects Shopify userErrors from nested GraphQL payloads", async () => {
    const body = {
      data: {
        productCreate: {
          product: null,
          userErrors: [{ field: ["title"], message: "Title is required" }]
        }
      }
    };
    const client = new ShopifyGraphqlClient(createConfig({
      storeUrl: "demo",
      adminAccessToken: "token"
    }), async () => jsonResponse(200, body));

    const result = await client.request({ query: "mutation { productCreate { userErrors { field message } } }" });

    expect(result).toMatchObject({
      ok: true,
      userErrors: [{ field: ["title"], message: "Title is required" }]
    });
    expect(collectUserErrors(body)).toEqual([{ field: ["title"], message: "Title is required" }]);
  });

  it("does not call fetch when token validation fails", async () => {
    let called = false;
    const fetcher: FetchLike = async () => {
      called = true;
      return jsonResponse(200, {});
    };
    const client = new ShopifyGraphqlClient(createConfig({ storeUrl: "demo" }), fetcher);

    await client.request({ query: "{ shop { name } }" });

    expect(called).toBe(false);
  });
});
