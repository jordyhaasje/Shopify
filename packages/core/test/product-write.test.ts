import { describe, expect, it } from "vitest";
import { createConfig, createProduct, updateProduct, updateProductVariantPrices, type FetchLike } from "../src/index.js";

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

  it("updates a product through only the productUpdate mutation and returns a safe summary", async () => {
    const requests: Array<{ body: string }> = [];
    const fetcher: FetchLike = async (_url, init) => {
      requests.push({ body: init.body });
      return jsonResponse({
        data: {
          productUpdate: {
            product: {
              id: "gid://shopify/Product/1",
              title: "Updated Shirt",
              handle: "updated-shirt",
              status: "ACTIVE",
              variants: { nodes: [{ id: "do-not-return" }] },
              media: { nodes: [{ id: "do-not-return" }] },
              metafields: { nodes: [{ id: "do-not-return" }] },
              seo: { title: "do-not-return" },
              inventoryQuantity: 10
            },
            userErrors: []
          }
        }
      });
    };

    const updateInput = {
      id: "gid://shopify/Product/1",
      title: "Updated Shirt",
      descriptionHtml: "<p>Updated copy.</p>",
      vendor: "Acme",
      productType: "Shirts",
      status: "active",
      tags: ["summer", "linen"],
      variants: [{ id: "gid://shopify/ProductVariant/1" }]
    };
    const result = await updateProduct(config(), updateInput, { fetcher });
    const request = JSON.parse(requests[0].body);
    const output = JSON.stringify(result);

    expect(result).toMatchObject({
      ok: true,
      status: "ok",
      product: {
        id: "gid://shopify/Product/1",
        title: "Updated Shirt",
        handle: "updated-shirt",
        status: "ACTIVE"
      }
    });
    expect(requests).toHaveLength(1);
    expect(request.query).toContain("mutation ShopifyStoreAgentProductUpdate");
    expect(request.query).toContain("productUpdate");
    expect(request.query).not.toContain("productCreate");
    expect(request.query).not.toContain("pageCreate");
    expect(request.query).not.toContain("collectionCreate");
    expect(request.query).not.toContain("refundCreate");
    expect(request.query).not.toContain("variants");
    expect(request.query).not.toContain("media");
    expect(request.query).not.toContain("collections");
    expect(request.query).not.toContain("metafields");
    expect(request.query).not.toContain("seo");
    expect(request.query).not.toContain("inventory");
    expect(request.variables.product).toEqual({
      id: "gid://shopify/Product/1",
      title: "Updated Shirt",
      descriptionHtml: "<p>Updated copy.</p>",
      vendor: "Acme",
      productType: "Shirts",
      status: "ACTIVE",
      tags: ["summer", "linen"]
    });
    expect(output).not.toContain("variants");
    expect(output).not.toContain("media");
    expect(output).not.toContain("metafields");
    expect(output).not.toContain("seo");
    expect(output).not.toContain("inventoryQuantity");
    expect(output).not.toContain("shpat_product_secret");
  });

  it("returns product update user errors safely", async () => {
    const result = await updateProduct(config(), {
      id: "gid://shopify/Product/1",
      title: "Updated Shirt"
    }, {
      fetcher: async () => jsonResponse({
        data: {
          productUpdate: {
            product: null,
            userErrors: [{ field: ["title"], message: "Title is invalid." }]
          }
        }
      })
    });

    expect(result).toMatchObject({
      ok: false,
      status: "user_errors",
      userErrors: [{ field: ["title"], message: "Title is invalid." }],
      diagnostics: [{ code: "shopify_user_errors" }]
    });
  });

  it("returns safe product update diagnostics for thrown network errors", async () => {
    const result = await updateProduct(config(), {
      id: "gid://shopify/Product/1",
      title: "Updated Shirt"
    }, {
      fetcher: async () => {
        throw new Error("network failed with token shpat_thrown_product_update_secret");
      }
    });
    const output = JSON.stringify(result);

    expect(result).toMatchObject({
      ok: false,
      status: "shopify_error",
      diagnostics: [{ code: "shopify_request_failed" }]
    });
    expect(output).not.toContain("shpat_thrown_product_update_secret");
  });

  it("rejects missing product update ID before calling Shopify", async () => {
    let fetchCalled = false;
    const result = await updateProduct(config(), {
      id: "",
      title: "Updated Shirt"
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

  it("rejects product update without allowed update fields before calling Shopify", async () => {
    let fetchCalled = false;
    const updateInput = {
      id: "gid://shopify/Product/1",
      variants: [{ id: "gid://shopify/ProductVariant/1" }]
    };
    const result = await updateProduct(config(), updateInput, {
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

  it("blocks product update read-only config before calling Shopify", async () => {
    let fetchCalled = false;
    const result = await updateProduct(createConfig({
      storeUrl: "demo",
      adminAccessToken: "shpat_product_secret",
      readOnly: true
    }), {
      id: "gid://shopify/Product/1",
      title: "Updated Shirt"
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

  it("updates explicit product variant prices through only productVariantsBulkUpdate", async () => {
    const requests: Array<{ body: string }> = [];
    const fetcher: FetchLike = async (_url, init) => {
      requests.push({ body: init.body });
      return jsonResponse({
        data: {
          productVariantsBulkUpdate: {
            productVariants: [
              {
                id: "gid://shopify/ProductVariant/1",
                price: "39.00",
                inventoryQuantity: 99,
                rawNodeOnly: "do-not-return"
              }
            ],
            userErrors: []
          }
        }
      });
    };

    const result = await updateProductVariantPrices(config(), {
      productId: "gid://shopify/Product/1",
      variants: [
        { id: "gid://shopify/ProductVariant/1", price: "39.00" }
      ]
    }, { fetcher });
    const request = JSON.parse(requests[0].body);
    const output = JSON.stringify(result);

    expect(result).toMatchObject({
      ok: true,
      status: "ok",
      variantPriceUpdate: {
        productId: "gid://shopify/Product/1",
        updatedVariantCount: 1,
        variants: [{ id: "gid://shopify/ProductVariant/1", price: "39.00" }]
      }
    });
    expect(requests).toHaveLength(1);
    expect(request.query).toContain("mutation ShopifyStoreAgentProductVariantPricesUpdate");
    expect(request.query).toContain("productVariantsBulkUpdate");
    expect(request.query).not.toContain("productUpdate");
    expect(request.query).not.toContain("productCreate");
    expect(request.query).not.toContain("inventory");
    expect(request.variables).toEqual({
      productId: "gid://shopify/Product/1",
      variants: [{ id: "gid://shopify/ProductVariant/1", price: "39.00" }]
    });
    expect(output).not.toContain("rawNodeOnly");
    expect(output).not.toContain("inventoryQuantity");
    expect(output).not.toContain("shpat_product_secret");
  });

  it("blocks variant price update with missing price input before calling Shopify", async () => {
    let fetchCalled = false;
    const result = await updateProductVariantPrices(config(), {
      productId: "gid://shopify/Product/1",
      variants: [{ id: "gid://shopify/ProductVariant/1", price: "" }]
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

  it("blocks variant price update read-only config before calling Shopify", async () => {
    let fetchCalled = false;
    const result = await updateProductVariantPrices(createConfig({
      storeUrl: "demo",
      adminAccessToken: "shpat_product_secret",
      readOnly: true
    }), {
      productId: "gid://shopify/Product/1",
      variants: [{ id: "gid://shopify/ProductVariant/1", price: "39.00" }]
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

  it("returns variant price update user errors safely", async () => {
    const result = await updateProductVariantPrices(config(), {
      productId: "gid://shopify/Product/1",
      variants: [{ id: "gid://shopify/ProductVariant/1", price: "39.00" }]
    }, {
      fetcher: async () => jsonResponse({
        data: {
          productVariantsBulkUpdate: {
            productVariants: null,
            userErrors: [{ field: ["variants", "0", "price"], message: "Price is invalid." }]
          }
        }
      })
    });

    expect(result).toMatchObject({
      ok: false,
      status: "user_errors",
      userErrors: [{ field: ["variants", "0", "price"], message: "Price is invalid." }],
      diagnostics: [{ code: "shopify_user_errors" }]
    });
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
