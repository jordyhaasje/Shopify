import { describe, expect, it } from "vitest";
import { createConfig, createProduct, type FetchLike } from "../src/index.js";

describe("product write helper", () => {
  it("creates a product through the productCreate mutation and returns a safe summary", async () => {
    const requests: Array<{ url: string; body: string; token?: string }> = [];
    const fetcher: FetchLike = async (url, init) => {
      requests.push({ url, body: init.body, token: init.headers["X-Shopify-Access-Token"] });
      return jsonResponse({
        data: {
          productCreate: {
            product: {
              id: "gid://shopify/Product/1",
              title: "Linen Shirt",
              handle: "linen-shirt",
              status: "DRAFT",
              rawNodeOnly: "do not return"
            },
            userErrors: []
          }
        }
      });
    };

    const result = await createProduct(config(), {
      title: "Linen Shirt",
      descriptionHtml: "<p>Light linen shirt.</p>",
      vendor: "Acme",
      productType: "Shirts",
      status: "draft",
      tags: ["linen", "summer"]
    }, { fetcher });
    const request = JSON.parse(requests[0].body);
    const output = JSON.stringify(result);

    expect(result).toMatchObject({
      ok: true,
      status: "ok",
      product: {
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
    expect(request.variables.product).toEqual({
      title: "Linen Shirt",
      descriptionHtml: "<p>Light linen shirt.</p>",
      vendor: "Acme",
      productType: "Shirts",
      status: "DRAFT",
      tags: ["linen", "summer"]
    });
    expect(output).not.toContain("rawNodeOnly");
    expect(output).not.toContain("shpat_product_secret");
  });

  it("returns Shopify user errors safely", async () => {
    const result = await createProduct(config(), {
      title: "Linen Shirt"
    }, {
      fetcher: async () => jsonResponse({
        data: {
          productCreate: {
            product: null,
            userErrors: [{ field: ["title"], message: "Title has already been taken." }]
          }
        }
      })
    });

    expect(result).toMatchObject({
      ok: false,
      status: "user_errors",
      userErrors: [{ field: ["title"], message: "Title has already been taken." }],
      diagnostics: [{ code: "shopify_user_errors" }]
    });
  });

  it("returns safe diagnostics for thrown network errors", async () => {
    const result = await createProduct(config(), {
      title: "Linen Shirt"
    }, {
      fetcher: async () => {
        throw new Error("network failed with token shpat_thrown_product_secret");
      }
    });
    const output = JSON.stringify(result);

    expect(result).toMatchObject({
      ok: false,
      status: "shopify_error",
      diagnostics: [{ code: "shopify_request_failed" }]
    });
    expect(output).not.toContain("shpat_thrown_product_secret");
  });

  it("rejects missing title before calling Shopify", async () => {
    let fetchCalled = false;
    const result = await createProduct(config(), {
      title: ""
    }, {
      fetcher: async () => {
        fetchCalled = true;
        return jsonResponse({});
      }
    });

    expect(result).toMatchObject({
      ok: false,
      status: "missing_input",
      diagnostics: [{ code: "missing_input" }]
    });
    expect(fetchCalled).toBe(false);
  });

  it("blocks read-only config before calling Shopify", async () => {
    let fetchCalled = false;
    const result = await createProduct(createConfig({
      storeUrl: "demo",
      adminAccessToken: "shpat_product_secret",
      readOnly: true
    }), {
      title: "Linen Shirt"
    }, {
      fetcher: async () => {
        fetchCalled = true;
        return jsonResponse({});
      }
    });

    expect(result).toMatchObject({
      ok: false,
      status: "blocked",
      diagnostics: [{ code: "read_only" }]
    });
    expect(fetchCalled).toBe(false);
  });
});

function config() {
  return createConfig({
    storeUrl: "demo",
    adminAccessToken: "shpat_product_secret",
    readOnly: false
  });
}

function jsonResponse(body: unknown) {
  return {
    ok: true,
    status: 200,
    async text() {
      return JSON.stringify(body);
    }
  };
}
