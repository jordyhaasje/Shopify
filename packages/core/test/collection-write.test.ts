import { describe, expect, it } from "vitest";
import { createCollection, createConfig, type FetchLike } from "../src/index.js";

describe("collection write helper", () => {
  it("creates a collection through only the collectionCreate mutation and returns a safe summary", async () => {
    const requests: Array<{ body: string; token?: string }> = [];
    const fetcher: FetchLike = async (_url, init) => {
      requests.push({ body: init.body, token: init.headers["X-Shopify-Access-Token"] });
      return jsonResponse({
        data: {
          collectionCreate: {
            collection: {
              id: "gid://shopify/Collection/1",
              title: "Summer Picks",
              handle: "summer-picks",
              rawNodeOnly: "do not return"
            },
            userErrors: []
          }
        }
      });
    };

    const result = await createCollection(config(), {
      title: "Summer Picks",
      handle: "summer-picks",
      productIds: ["gid://shopify/Product/1", "gid://shopify/Product/2"]
    }, { fetcher });
    const request = JSON.parse(requests[0].body);
    const output = JSON.stringify(result);

    expect(result).toMatchObject({
      ok: true,
      status: "ok",
      collection: {
        id: "gid://shopify/Collection/1",
        title: "Summer Picks",
        handle: "summer-picks"
      }
    });
    expect(requests).toHaveLength(1);
    expect(request.query).toContain("mutation ShopifyStoreAgentCollectionCreate");
    expect(request.query).toContain("collectionCreate");
    expect(request.query).not.toContain("productCreate");
    expect(request.query).not.toContain("productUpdate");
    expect(request.query).not.toContain("pageCreate");
    expect(request.query).not.toContain("refundCreate");
    expect(request.variables.collection).toEqual({
      title: "Summer Picks",
      handle: "summer-picks",
      sources: [{
        source: {
          title: "Summer Picks product selections",
          inclusion: {
            selections: [
              { productId: "gid://shopify/Product/1" },
              { productId: "gid://shopify/Product/2" }
            ]
          }
        }
      }]
    });
    expect(output).not.toContain("rawNodeOnly");
    expect(output).not.toContain("shpat_collection_secret");
  });

  it("returns Shopify user errors safely", async () => {
    const result = await createCollection(config(), {
      title: "Summer Picks",
      productIds: ["gid://shopify/Product/1"]
    }, {
      fetcher: async () => jsonResponse({
        data: {
          collectionCreate: {
            collection: null,
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

  it("rejects missing product IDs before calling Shopify", async () => {
    let fetchCalled = false;
    const result = await createCollection(config(), {
      title: "Summer Picks",
      productIds: []
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
    const result = await createCollection(createConfig({
      storeUrl: "demo",
      adminAccessToken: "shpat_collection_secret",
      readOnly: true
    }), {
      title: "Summer Picks",
      productIds: ["gid://shopify/Product/1"]
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
    adminAccessToken: "shpat_collection_secret",
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
