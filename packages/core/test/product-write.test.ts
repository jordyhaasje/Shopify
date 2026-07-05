import { describe, expect, it } from "vitest";
import { addProductMedia, addProductOptionValues, createConfig, createProduct, createProductOptions, createProductVariants, deleteProductOptions, deleteProductOptionValues, renameProductOption, renameProductOptionValue, reorderProductOptions, updateProduct, updateProductVariantPrices, type FetchLike } from "../src/index.js";

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

  it("adds product media through productUpdate media without returning raw media nodes", async () => {
    const requests: Array<{ body: string }> = [];
    const fetcher: FetchLike = async (_url, init) => {
      requests.push({ body: init.body });
      return jsonResponse({
        data: {
          productUpdate: {
            product: {
              id: "gid://shopify/Product/1",
              title: "Linen Shirt",
              handle: "linen-shirt",
              status: "ACTIVE",
              media: { nodes: [{ id: "do-not-return", preview: "rawNodeOnly" }] }
            },
            userErrors: []
          }
        }
      });
    };

    const result = await addProductMedia(config(), {
      productId: "gid://shopify/Product/1",
      media: [{
        originalSource: "https://cdn.example.com/new.jpg",
        mediaContentType: "IMAGE",
        alt: "Front view"
      }]
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
        status: "ACTIVE"
      },
      mediaAdd: {
        productId: "gid://shopify/Product/1",
        addedMediaCount: 1,
        media: [{
          originalSource: "https://cdn.example.com/new.jpg",
          mediaContentType: "IMAGE",
          alt: "Front view"
        }]
      }
    });
    expect(requests).toHaveLength(1);
    expect(request.query).toContain("mutation ShopifyStoreAgentProductMediaAdd");
    expect(request.query).toContain("productUpdate");
    expect(request.query).toContain("media: $media");
    expect(request.query).not.toContain("productCreateMedia");
    expect(request.query).not.toContain("productUpdateMedia");
    expect(request.variables).toEqual({
      product: { id: "gid://shopify/Product/1" },
      media: [{
        originalSource: "https://cdn.example.com/new.jpg",
        mediaContentType: "IMAGE",
        alt: "Front view"
      }]
    });
    expect(output).not.toContain("rawNodeOnly");
    expect(output).not.toContain("shpat_product_secret");
  });

  it("rejects unsafe product media URLs before calling Shopify", async () => {
    let fetchCalled = false;
    const result = await addProductMedia(config(), {
      productId: "gid://shopify/Product/1",
      media: [{
        originalSource: "https://cdn.example.com/new.jpg?token=shpat_media_secret",
        mediaContentType: "IMAGE"
      }]
    }, {
      fetcher: async () => {
        fetchCalled = true;
        return jsonResponse({});
      }
    });
    const output = JSON.stringify(result);

    expect(result).toMatchObject({
      ok: false,
      status: "missing_input",
      diagnostics: [{ code: "missing_input" }]
    });
    expect(fetchCalled).toBe(false);
    expect(output).not.toContain("shpat_media_secret");
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

  it("creates explicit product variants through only productVariantsBulkCreate", async () => {
    const requests: Array<{ body: string }> = [];
    const fetcher: FetchLike = async (_url, init) => {
      requests.push({ body: init.body });
      return jsonResponse({
        data: {
          productVariantsBulkCreate: {
            productVariants: [
              {
                id: "gid://shopify/ProductVariant/2",
                title: "Large",
                price: "49.00",
                sku: "LINEN-L",
                inventoryQuantity: 99,
                media: { nodes: [{ id: "do-not-return" }] },
                rawNodeOnly: "do-not-return"
              }
            ],
            userErrors: []
          }
        }
      });
    };

    const result = await createProductVariants(config(), {
      productId: "gid://shopify/Product/1",
      variants: [{
        optionValues: [{ optionName: "Size", name: "Large" }],
        price: "49.00",
        sku: "LINEN-L"
      }]
    }, { fetcher });
    const request = JSON.parse(requests[0].body);
    const output = JSON.stringify(result);

    expect(result).toMatchObject({
      ok: true,
      status: "ok",
      variantCreate: {
        productId: "gid://shopify/Product/1",
        createdVariantCount: 1,
        variants: [{ id: "gid://shopify/ProductVariant/2", title: "Large", price: "49.00", sku: "LINEN-L" }]
      }
    });
    expect(requests).toHaveLength(1);
    expect(request.query).toContain("mutation ShopifyStoreAgentProductVariantsCreate");
    expect(request.query).toContain("productVariantsBulkCreate");
    expect(request.query).not.toContain("productUpdate");
    expect(request.query).not.toContain("productCreate");
    expect(request.query).not.toContain("inventory");
    expect(request.query).not.toContain("media");
    expect(request.query).not.toContain("metafields");
    expect(request.variables).toEqual({
      productId: "gid://shopify/Product/1",
      variants: [{
        optionValues: [{ optionName: "Size", name: "Large" }],
        price: "49.00",
        sku: "LINEN-L"
      }]
    });
    expect(output).not.toContain("rawNodeOnly");
    expect(output).not.toContain("inventoryQuantity");
    expect(output).not.toContain("media");
    expect(output).not.toContain("shpat_product_secret");
  });

  it("blocks variant create without explicit option values before calling Shopify", async () => {
    let fetchCalled = false;
    const result = await createProductVariants(config(), {
      productId: "gid://shopify/Product/1",
      variants: [{ optionValues: [], price: "49.00" }]
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

  it("blocks variant create read-only config before calling Shopify", async () => {
    let fetchCalled = false;
    const result = await createProductVariants(createConfig({
      storeUrl: "demo",
      adminAccessToken: "shpat_product_secret",
      readOnly: true
    }), {
      productId: "gid://shopify/Product/1",
      variants: [{ optionValues: [{ optionName: "Size", name: "Large" }] }]
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

  it("returns variant create user errors safely", async () => {
    const result = await createProductVariants(config(), {
      productId: "gid://shopify/Product/1",
      variants: [{ optionValues: [{ optionName: "Size", name: "Large" }] }]
    }, {
      fetcher: async () => jsonResponse({
        data: {
          productVariantsBulkCreate: {
            productVariants: null,
            userErrors: [{ field: ["variants", "0", "optionValues"], message: "Option value is invalid." }]
          }
        }
      })
    });

    expect(result).toMatchObject({
      ok: false,
      status: "user_errors",
      userErrors: [{ field: ["variants", "0", "optionValues"], message: "Option value is invalid." }],
      diagnostics: [{ code: "shopify_user_errors" }]
    });
  });

  it("creates explicit product options through only productOptionsCreate with LEAVE_AS_IS", async () => {
    const requests: Array<{ body: string }> = [];
    const fetcher: FetchLike = async (_url, init) => {
      requests.push({ body: init.body });
      return jsonResponse({
        data: {
          productOptionsCreate: {
            product: {
              id: "gid://shopify/Product/1",
              options: [
                {
                  id: "gid://shopify/ProductOption/1",
                  name: "Material",
                  position: 2,
                  optionValues: [
                    { id: "gid://shopify/ProductOptionValue/1", name: "Cotton", hasVariants: true, rawNodeOnly: "do-not-return" },
                    { id: "gid://shopify/ProductOptionValue/2", name: "Linen", hasVariants: false }
                  ],
                  rawNodeOnly: "do-not-return"
                }
              ],
              variants: { nodes: [{ id: "do-not-return" }] }
            },
            userErrors: []
          }
        }
      });
    };

    const result = await createProductOptions(config(), {
      productId: "gid://shopify/Product/1",
      options: [{ name: "Material", values: ["Cotton", "Linen"] }]
    }, { fetcher });
    const request = JSON.parse(requests[0].body);
    const output = JSON.stringify(result);

    expect(result).toMatchObject({
      ok: true,
      status: "ok",
      optionCreate: {
        productId: "gid://shopify/Product/1",
        createdOptionCount: 1,
        variantStrategy: "LEAVE_AS_IS",
        options: [{ id: "gid://shopify/ProductOption/1", name: "Material", position: 2, values: ["Cotton", "Linen"] }]
      }
    });
    expect(requests).toHaveLength(1);
    expect(request.query).toContain("mutation ShopifyStoreAgentProductOptionsCreate");
    expect(request.query).toContain("productOptionsCreate");
    expect(request.query).not.toContain("productUpdate");
    expect(request.query).not.toContain("productVariantsBulkCreate");
    expect(request.query).not.toContain("inventory");
    expect(request.query).not.toContain("metafields");
    expect(request.variables).toEqual({
      productId: "gid://shopify/Product/1",
      options: [{ name: "Material", values: [{ name: "Cotton" }, { name: "Linen" }] }],
      variantStrategy: "LEAVE_AS_IS"
    });
    expect(output).not.toContain("rawNodeOnly");
    expect(output).not.toContain("variants");
    expect(output).not.toContain("shpat_product_secret");
  });

  it("blocks option create without explicit values before calling Shopify", async () => {
    let fetchCalled = false;
    const result = await createProductOptions(config(), {
      productId: "gid://shopify/Product/1",
      options: [{ name: "Material", values: [] }]
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

  it("blocks option create read-only config before calling Shopify", async () => {
    let fetchCalled = false;
    const result = await createProductOptions(createConfig({
      storeUrl: "demo",
      adminAccessToken: "shpat_product_secret",
      readOnly: true
    }), {
      productId: "gid://shopify/Product/1",
      options: [{ name: "Material", values: ["Cotton"] }]
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

  it("returns option create user errors safely", async () => {
    const result = await createProductOptions(config(), {
      productId: "gid://shopify/Product/1",
      options: [{ name: "Material", values: ["Cotton"] }]
    }, {
      fetcher: async () => jsonResponse({
        data: {
          productOptionsCreate: {
            product: null,
            userErrors: [{ field: ["options", "0", "name"], message: "Option name is invalid.", code: "INVALID" }]
          }
        }
      })
    });

    expect(result).toMatchObject({
      ok: false,
      status: "user_errors",
      userErrors: [{ field: ["options", "0", "name"], message: "Option name is invalid." }],
      diagnostics: [{ code: "shopify_user_errors" }]
    });
  });

  it("deletes explicit product options through only productOptionsDelete with NON_DESTRUCTIVE", async () => {
    const requests: Array<{ body: string }> = [];
    const fetcher: FetchLike = async (_url, init) => {
      requests.push({ body: init.body });
      return jsonResponse({
        data: {
          productOptionsDelete: {
            deletedOptionsIds: ["gid://shopify/ProductOption/2"],
            product: {
              id: "gid://shopify/Product/1",
              options: [
                {
                  id: "gid://shopify/ProductOption/1",
                  name: "Size",
                  position: 1,
                  optionValues: [
                    { id: "gid://shopify/ProductOptionValue/1", name: "Small", hasVariants: true, rawNodeOnly: "do-not-return" }
                  ],
                  rawNodeOnly: "do-not-return"
                }
              ],
              variants: { nodes: [{ id: "do-not-return" }] }
            },
            userErrors: []
          }
        }
      });
    };

    const result = await deleteProductOptions(config(), {
      productId: "gid://shopify/Product/1",
      optionIds: ["gid://shopify/ProductOption/2"]
    }, { fetcher });
    const request = JSON.parse(requests[0].body);
    const output = JSON.stringify(result);

    expect(result).toMatchObject({
      ok: true,
      status: "ok",
      optionDelete: {
        productId: "gid://shopify/Product/1",
        deletedOptionCount: 1,
        optionIds: ["gid://shopify/ProductOption/2"],
        strategy: "NON_DESTRUCTIVE",
        remainingOptions: [
          {
            id: "gid://shopify/ProductOption/1",
            name: "Size",
            position: 1,
            values: ["Small"]
          }
        ]
      }
    });
    expect(requests).toHaveLength(1);
    expect(request.query).toContain("mutation ShopifyStoreAgentProductOptionsDelete");
    expect(request.query).toContain("productOptionsDelete");
    expect(request.query).not.toContain("productUpdate");
    expect(request.query).not.toContain("productOptionUpdate");
    expect(request.query).not.toContain("inventory");
    expect(request.query).not.toContain("metafields");
    expect(request.variables).toEqual({
      productId: "gid://shopify/Product/1",
      options: ["gid://shopify/ProductOption/2"],
      strategy: "NON_DESTRUCTIVE"
    });
    expect(output).not.toContain("rawNodeOnly");
    expect(output).not.toContain("variants");
    expect(output).not.toContain("shpat_product_secret");
  });

  it("blocks option delete read-only config before calling Shopify", async () => {
    let fetchCalled = false;
    const result = await deleteProductOptions(createConfig({
      storeUrl: "demo",
      adminAccessToken: "shpat_product_secret",
      readOnly: true
    }), {
      productId: "gid://shopify/Product/1",
      optionIds: ["gid://shopify/ProductOption/2"]
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

  it("returns option delete user errors safely", async () => {
    const result = await deleteProductOptions(config(), {
      productId: "gid://shopify/Product/1",
      optionIds: ["gid://shopify/ProductOption/2"]
    }, {
      fetcher: async () => jsonResponse({
        data: {
          productOptionsDelete: {
            deletedOptionsIds: [],
            product: null,
            userErrors: [{ field: ["options", "0"], message: "Option cannot be deleted without deleting variants.", code: "CANNOT_DELETE_OPTION_WITH_VARIANTS" }]
          }
        }
      })
    });

    expect(result).toMatchObject({
      ok: false,
      status: "user_errors",
      userErrors: [{ field: ["options", "0"], message: "Option cannot be deleted without deleting variants." }],
      diagnostics: [{ code: "shopify_user_errors" }]
    });
  });

  it("reorders explicit product options through only productOptionsReorder", async () => {
    const requests: Array<{ body: string }> = [];
    const fetcher: FetchLike = async (_url, init) => {
      requests.push({ body: init.body });
      return jsonResponse({
        data: {
          productOptionsReorder: {
            product: {
              id: "gid://shopify/Product/1",
              options: [
                {
                  id: "gid://shopify/ProductOption/2",
                  name: "Color",
                  position: 1,
                  optionValues: [
                    { id: "gid://shopify/ProductOptionValue/2", name: "Red", hasVariants: true, rawNodeOnly: "do-not-return" }
                  ],
                  rawNodeOnly: "do-not-return"
                },
                {
                  id: "gid://shopify/ProductOption/1",
                  name: "Size",
                  position: 2,
                  optionValues: [
                    { id: "gid://shopify/ProductOptionValue/1", name: "Small", hasVariants: true }
                  ]
                }
              ],
              variants: { nodes: [{ id: "do-not-return" }] }
            },
            userErrors: []
          }
        }
      });
    };

    const result = await reorderProductOptions(config(), {
      productId: "gid://shopify/Product/1",
      options: [
        { id: "gid://shopify/ProductOption/2", values: [{ id: "gid://shopify/ProductOptionValue/2" }] },
        { id: "gid://shopify/ProductOption/1", values: [{ name: "Small" }] }
      ]
    }, { fetcher });
    const request = JSON.parse(requests[0].body);
    const output = JSON.stringify(result);

    expect(result).toMatchObject({
      ok: true,
      status: "ok",
      optionReorder: {
        productId: "gid://shopify/Product/1",
        reorderedOptionCount: 2,
        options: [
          { id: "gid://shopify/ProductOption/2", name: "Color", position: 1, values: ["Red"] },
          { id: "gid://shopify/ProductOption/1", name: "Size", position: 2, values: ["Small"] }
        ]
      }
    });
    expect(requests).toHaveLength(1);
    expect(request.query).toContain("mutation ShopifyStoreAgentProductOptionsReorder");
    expect(request.query).toContain("productOptionsReorder");
    expect(request.query).not.toContain("productUpdate");
    expect(request.query).not.toContain("productOptionUpdate");
    expect(request.query).not.toContain("productOptionsDelete");
    expect(request.query).not.toContain("inventory");
    expect(request.query).not.toContain("metafields");
    expect(request.variables).toEqual({
      productId: "gid://shopify/Product/1",
      options: [
        { id: "gid://shopify/ProductOption/2", values: [{ id: "gid://shopify/ProductOptionValue/2" }] },
        { id: "gid://shopify/ProductOption/1", values: [{ name: "Small" }] }
      ]
    });
    expect(output).not.toContain("rawNodeOnly");
    expect(output).not.toContain("variants");
    expect(output).not.toContain("shpat_product_secret");
  });

  it("blocks option reorder read-only config before calling Shopify", async () => {
    let fetchCalled = false;
    const result = await reorderProductOptions(createConfig({
      storeUrl: "demo",
      adminAccessToken: "shpat_product_secret",
      readOnly: true
    }), {
      productId: "gid://shopify/Product/1",
      options: [{ id: "gid://shopify/ProductOption/2" }, { id: "gid://shopify/ProductOption/1" }]
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

  it("returns option reorder user errors safely", async () => {
    const result = await reorderProductOptions(config(), {
      productId: "gid://shopify/Product/1",
      options: [{ id: "gid://shopify/ProductOption/2" }, { id: "gid://shopify/ProductOption/1" }]
    }, {
      fetcher: async () => jsonResponse({
        data: {
          productOptionsReorder: {
            product: null,
            userErrors: [{ field: ["options", "0"], message: "Option order is invalid.", code: "INVALID" }]
          }
        }
      })
    });

    expect(result).toMatchObject({
      ok: false,
      status: "user_errors",
      userErrors: [{ field: ["options", "0"], message: "Option order is invalid." }],
      diagnostics: [{ code: "shopify_user_errors" }]
    });
  });

  it("renames an explicit product option through only productOptionUpdate with LEAVE_AS_IS", async () => {
    const requests: Array<{ body: string }> = [];
    const fetcher: FetchLike = async (_url, init) => {
      requests.push({ body: init.body });
      return jsonResponse({
        data: {
          productOptionUpdate: {
            product: {
              id: "gid://shopify/Product/1",
              options: [
                {
                  id: "gid://shopify/ProductOption/1",
                  name: "Fabric",
                  position: 2,
                  optionValues: [
                    { id: "gid://shopify/ProductOptionValue/1", name: "Cotton", hasVariants: true, rawNodeOnly: "do-not-return" }
                  ],
                  rawNodeOnly: "do-not-return"
                }
              ],
              variants: { nodes: [{ id: "do-not-return" }] }
            },
            userErrors: []
          }
        }
      });
    };

    const result = await renameProductOption(config(), {
      productId: "gid://shopify/Product/1",
      option: { id: "gid://shopify/ProductOption/1", name: "Fabric" }
    }, { fetcher });
    const request = JSON.parse(requests[0].body);
    const output = JSON.stringify(result);

    expect(result).toMatchObject({
      ok: true,
      status: "ok",
      optionRename: {
        productId: "gid://shopify/Product/1",
        variantStrategy: "LEAVE_AS_IS",
        option: { id: "gid://shopify/ProductOption/1", name: "Fabric", position: 2, values: ["Cotton"] }
      }
    });
    expect(requests).toHaveLength(1);
    expect(request.query).toContain("mutation ShopifyStoreAgentProductOptionUpdate");
    expect(request.query).toContain("productOptionUpdate");
    expect(request.query).not.toContain("productUpdate");
    expect(request.query).not.toContain("productOptionsCreate");
    expect(request.query).not.toContain("inventory");
    expect(request.query).not.toContain("metafields");
    expect(request.variables).toEqual({
      productId: "gid://shopify/Product/1",
      option: { id: "gid://shopify/ProductOption/1", name: "Fabric" },
      variantStrategy: "LEAVE_AS_IS"
    });
    expect(output).not.toContain("rawNodeOnly");
    expect(output).not.toContain("variants");
    expect(output).not.toContain("shpat_product_secret");
  });

  it("blocks option rename read-only config before calling Shopify", async () => {
    let fetchCalled = false;
    const result = await renameProductOption(createConfig({
      storeUrl: "demo",
      adminAccessToken: "shpat_product_secret",
      readOnly: true
    }), {
      productId: "gid://shopify/Product/1",
      option: { id: "gid://shopify/ProductOption/1", name: "Fabric" }
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

  it("returns option rename user errors safely", async () => {
    const result = await renameProductOption(config(), {
      productId: "gid://shopify/Product/1",
      option: { id: "gid://shopify/ProductOption/1", name: "Fabric" }
    }, {
      fetcher: async () => jsonResponse({
        data: {
          productOptionUpdate: {
            product: null,
            userErrors: [{ field: ["option", "name"], message: "Option name is invalid.", code: "INVALID" }]
          }
        }
      })
    });

    expect(result).toMatchObject({
      ok: false,
      status: "user_errors",
      userErrors: [{ field: ["option", "name"], message: "Option name is invalid." }],
      diagnostics: [{ code: "shopify_user_errors" }]
    });
  });

  it("renames an explicit product option value through only productOptionUpdate with LEAVE_AS_IS", async () => {
    const requests: Array<{ body: string }> = [];
    const fetcher: FetchLike = async (_url, init) => {
      requests.push({ body: init.body });
      return jsonResponse({
        data: {
          productOptionUpdate: {
            product: {
              id: "gid://shopify/Product/1",
              options: [
                {
                  id: "gid://shopify/ProductOption/1",
                  name: "Color",
                  position: 1,
                  optionValues: [
                    { id: "gid://shopify/ProductOptionValue/1", name: "Purple", hasVariants: true, rawNodeOnly: "do-not-return" }
                  ],
                  rawNodeOnly: "do-not-return"
                }
              ],
              variants: { nodes: [{ id: "do-not-return" }] }
            },
            userErrors: []
          }
        }
      });
    };

    const result = await renameProductOptionValue(config(), {
      productId: "gid://shopify/Product/1",
      optionId: "gid://shopify/ProductOption/1",
      value: { id: "gid://shopify/ProductOptionValue/1", name: "Purple" }
    }, { fetcher });
    const request = JSON.parse(requests[0].body);
    const output = JSON.stringify(result);

    expect(result).toMatchObject({
      ok: true,
      status: "ok",
      optionValueRename: {
        productId: "gid://shopify/Product/1",
        optionId: "gid://shopify/ProductOption/1",
        variantStrategy: "LEAVE_AS_IS",
        value: { id: "gid://shopify/ProductOptionValue/1", name: "Purple" }
      }
    });
    expect(requests).toHaveLength(1);
    expect(request.query).toContain("mutation ShopifyStoreAgentProductOptionUpdate");
    expect(request.query).toContain("productOptionUpdate");
    expect(request.query).not.toContain("productUpdate");
    expect(request.query).not.toContain("productOptionsCreate");
    expect(request.query).not.toContain("inventory");
    expect(request.query).not.toContain("metafields");
    expect(request.variables).toEqual({
      productId: "gid://shopify/Product/1",
      option: { id: "gid://shopify/ProductOption/1" },
      optionValuesToUpdate: [{ id: "gid://shopify/ProductOptionValue/1", name: "Purple" }],
      variantStrategy: "LEAVE_AS_IS"
    });
    expect(output).not.toContain("rawNodeOnly");
    expect(output).not.toContain("variants");
    expect(output).not.toContain("shpat_product_secret");
  });

  it("blocks option value rename read-only config before calling Shopify", async () => {
    let fetchCalled = false;
    const result = await renameProductOptionValue(createConfig({
      storeUrl: "demo",
      adminAccessToken: "shpat_product_secret",
      readOnly: true
    }), {
      productId: "gid://shopify/Product/1",
      optionId: "gid://shopify/ProductOption/1",
      value: { id: "gid://shopify/ProductOptionValue/1", name: "Purple" }
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

  it("returns option value rename user errors safely", async () => {
    const result = await renameProductOptionValue(config(), {
      productId: "gid://shopify/Product/1",
      optionId: "gid://shopify/ProductOption/1",
      value: { id: "gid://shopify/ProductOptionValue/1", name: "Purple" }
    }, {
      fetcher: async () => jsonResponse({
        data: {
          productOptionUpdate: {
            product: null,
            userErrors: [{ field: ["optionValuesToUpdate", "0", "name"], message: "Option value name is invalid.", code: "INVALID" }]
          }
        }
      })
    });

    expect(result).toMatchObject({
      ok: false,
      status: "user_errors",
      userErrors: [{ field: ["optionValuesToUpdate", "0", "name"], message: "Option value name is invalid." }],
      diagnostics: [{ code: "shopify_user_errors" }]
    });
  });

  it("adds explicit product option values through only productOptionUpdate with LEAVE_AS_IS", async () => {
    const requests: Array<{ body: string }> = [];
    const fetcher: FetchLike = async (_url, init) => {
      requests.push({ body: init.body });
      return jsonResponse({
        data: {
          productOptionUpdate: {
            product: {
              id: "gid://shopify/Product/1",
              options: [
                {
                  id: "gid://shopify/ProductOption/1",
                  name: "Color",
                  position: 1,
                  optionValues: [
                    { id: "gid://shopify/ProductOptionValue/1", name: "Yellow", hasVariants: false, rawNodeOnly: "do-not-return" },
                    { id: "gid://shopify/ProductOptionValue/2", name: "Red", hasVariants: false }
                  ],
                  rawNodeOnly: "do-not-return"
                }
              ],
              variants: { nodes: [{ id: "do-not-return" }] }
            },
            userErrors: []
          }
        }
      });
    };

    const result = await addProductOptionValues(config(), {
      productId: "gid://shopify/Product/1",
      optionId: "gid://shopify/ProductOption/1",
      values: [{ name: "Yellow" }, { name: "Red" }]
    }, { fetcher });
    const request = JSON.parse(requests[0].body);
    const output = JSON.stringify(result);

    expect(result).toMatchObject({
      ok: true,
      status: "ok",
      optionValueAdd: {
        productId: "gid://shopify/Product/1",
        optionId: "gid://shopify/ProductOption/1",
        addedValueCount: 2,
        variantStrategy: "LEAVE_AS_IS",
        values: [
          { id: "gid://shopify/ProductOptionValue/1", name: "Yellow" },
          { id: "gid://shopify/ProductOptionValue/2", name: "Red" }
        ]
      }
    });
    expect(requests).toHaveLength(1);
    expect(request.query).toContain("mutation ShopifyStoreAgentProductOptionUpdate");
    expect(request.query).toContain("productOptionUpdate");
    expect(request.query).not.toContain("productUpdate");
    expect(request.query).not.toContain("productOptionsCreate");
    expect(request.query).not.toContain("inventory");
    expect(request.query).not.toContain("metafields");
    expect(request.variables).toEqual({
      productId: "gid://shopify/Product/1",
      option: { id: "gid://shopify/ProductOption/1" },
      optionValuesToAdd: [{ name: "Yellow" }, { name: "Red" }],
      variantStrategy: "LEAVE_AS_IS"
    });
    expect(output).not.toContain("rawNodeOnly");
    expect(output).not.toContain("variants");
    expect(output).not.toContain("shpat_product_secret");
  });

  it("blocks option value add read-only config before calling Shopify", async () => {
    let fetchCalled = false;
    const result = await addProductOptionValues(createConfig({
      storeUrl: "demo",
      adminAccessToken: "shpat_product_secret",
      readOnly: true
    }), {
      productId: "gid://shopify/Product/1",
      optionId: "gid://shopify/ProductOption/1",
      values: [{ name: "Yellow" }]
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

  it("returns option value add user errors safely", async () => {
    const result = await addProductOptionValues(config(), {
      productId: "gid://shopify/Product/1",
      optionId: "gid://shopify/ProductOption/1",
      values: [{ name: "Yellow" }]
    }, {
      fetcher: async () => jsonResponse({
        data: {
          productOptionUpdate: {
            product: null,
            userErrors: [{ field: ["optionValuesToAdd", "0", "name"], message: "Option value already exists.", code: "TAKEN" }]
          }
        }
      })
    });

    expect(result).toMatchObject({
      ok: false,
      status: "user_errors",
      userErrors: [{ field: ["optionValuesToAdd", "0", "name"], message: "Option value already exists." }],
      diagnostics: [{ code: "shopify_user_errors" }]
    });
  });

  it("deletes explicit product option values through only productOptionUpdate with LEAVE_AS_IS", async () => {
    const requests: Array<{ body: string }> = [];
    const fetcher: FetchLike = async (_url, init) => {
      requests.push({ body: init.body });
      return jsonResponse({
        data: {
          productOptionUpdate: {
            product: {
              id: "gid://shopify/Product/1",
              options: [
                {
                  id: "gid://shopify/ProductOption/1",
                  name: "Color",
                  position: 1,
                  optionValues: [
                    { id: "gid://shopify/ProductOptionValue/2", name: "Red", hasVariants: true, rawNodeOnly: "do-not-return" }
                  ],
                  rawNodeOnly: "do-not-return"
                }
              ],
              variants: { nodes: [{ id: "do-not-return" }] }
            },
            userErrors: []
          }
        }
      });
    };

    const result = await deleteProductOptionValues(config(), {
      productId: "gid://shopify/Product/1",
      optionId: "gid://shopify/ProductOption/1",
      valueIds: ["gid://shopify/ProductOptionValue/1"]
    }, { fetcher });
    const request = JSON.parse(requests[0].body);
    const output = JSON.stringify(result);

    expect(result).toMatchObject({
      ok: true,
      status: "ok",
      optionValueDelete: {
        productId: "gid://shopify/Product/1",
        optionId: "gid://shopify/ProductOption/1",
        deletedValueCount: 1,
        valueIds: ["gid://shopify/ProductOptionValue/1"],
        variantStrategy: "LEAVE_AS_IS",
        remainingValues: [
          { id: "gid://shopify/ProductOptionValue/2", name: "Red" }
        ]
      }
    });
    expect(requests).toHaveLength(1);
    expect(request.query).toContain("mutation ShopifyStoreAgentProductOptionUpdate");
    expect(request.query).toContain("productOptionUpdate");
    expect(request.query).not.toContain("productUpdate");
    expect(request.query).not.toContain("productOptionsCreate");
    expect(request.query).not.toContain("inventory");
    expect(request.query).not.toContain("metafields");
    expect(request.variables).toEqual({
      productId: "gid://shopify/Product/1",
      option: { id: "gid://shopify/ProductOption/1" },
      optionValuesToDelete: ["gid://shopify/ProductOptionValue/1"],
      variantStrategy: "LEAVE_AS_IS"
    });
    expect(output).not.toContain("rawNodeOnly");
    expect(output).not.toContain("variants");
    expect(output).not.toContain("shpat_product_secret");
  });

  it("blocks option value delete read-only config before calling Shopify", async () => {
    let fetchCalled = false;
    const result = await deleteProductOptionValues(createConfig({
      storeUrl: "demo",
      adminAccessToken: "shpat_product_secret",
      readOnly: true
    }), {
      productId: "gid://shopify/Product/1",
      optionId: "gid://shopify/ProductOption/1",
      valueIds: ["gid://shopify/ProductOptionValue/1"]
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

  it("returns option value delete user errors safely", async () => {
    const result = await deleteProductOptionValues(config(), {
      productId: "gid://shopify/Product/1",
      optionId: "gid://shopify/ProductOption/1",
      valueIds: ["gid://shopify/ProductOptionValue/1"]
    }, {
      fetcher: async () => jsonResponse({
        data: {
          productOptionUpdate: {
            product: null,
            userErrors: [{ field: ["optionValuesToDelete", "0"], message: "Option value cannot be deleted.", code: "INVALID" }]
          }
        }
      })
    });

    expect(result).toMatchObject({
      ok: false,
      status: "user_errors",
      userErrors: [{ field: ["optionValuesToDelete", "0"], message: "Option value cannot be deleted." }],
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
