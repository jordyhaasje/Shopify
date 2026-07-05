import { describe, expect, it } from "vitest";
import { adjustInventoryQuantity, createConfig, setInventoryQuantity, type FetchLike } from "../src/index.js";

describe("inventory write helper", () => {
  it("sets an explicit inventory quantity through inventorySetQuantities", async () => {
    const requests: Array<{ body: string; token?: string }> = [];
    const fetcher: FetchLike = async (_url, init) => {
      requests.push({ body: init.body, token: init.headers["X-Shopify-Access-Token"] });
      return jsonResponse({
        data: {
          inventorySetQuantities: {
            inventoryAdjustmentGroup: {
              reason: "Inventory correction",
              referenceDocumentUri: "gid://store-agent/TestRun/1",
              changes: [
                { name: "available", delta: 3, quantityAfterChange: 8 },
                { name: "on_hand", delta: 3, quantityAfterChange: 8 }
              ],
              rawNodeOnly: "do not return"
            },
            userErrors: []
          }
        }
      });
    };

    const result = await setInventoryQuantity(config(), {
      inventoryItemId: "gid://shopify/InventoryItem/1",
      locationId: "gid://shopify/Location/1",
      quantity: 8,
      compareQuantity: 5,
      reason: "correction",
      referenceDocumentUri: "gid://store-agent/TestRun/1",
      idempotencyKey: "store-agent:preview_123"
    }, { fetcher });
    const request = JSON.parse(requests[0].body);
    const output = JSON.stringify(result);

    expect(result).toMatchObject({
      ok: true,
      status: "ok",
      inventorySet: {
        inventoryItemId: "gid://shopify/InventoryItem/1",
        locationId: "gid://shopify/Location/1",
        name: "available",
        quantity: 8,
        compareQuantity: 5,
        ignoreCompareQuantity: false,
        changes: [
          { name: "available", delta: 3, quantityAfterChange: 8 },
          { name: "on_hand", delta: 3, quantityAfterChange: 8 }
        ]
      }
    });
    expect(requests).toHaveLength(1);
    expect(request.query).toContain("mutation ShopifyStoreAgentInventorySetQuantities");
    expect(request.query).toContain("@idempotent");
    expect(request.query).not.toContain("productUpdate");
    expect(request.variables).toEqual({
      input: {
        name: "available",
        reason: "correction",
        referenceDocumentUri: "gid://store-agent/TestRun/1",
        ignoreCompareQuantity: undefined,
        quantities: [{
          inventoryItemId: "gid://shopify/InventoryItem/1",
          locationId: "gid://shopify/Location/1",
          quantity: 8,
          compareQuantity: 5
        }]
      },
      idempotencyKey: "store-agent:preview_123"
    });
    expect(output).not.toContain("rawNodeOnly");
    expect(output).not.toContain("shpat_inventory_secret");
  });

  it("blocks read-only config before calling Shopify", async () => {
    let called = false;
    const result = await setInventoryQuantity(createConfig({
      storeUrl: "demo",
      adminAccessToken: "shpat_inventory_secret",
      readOnly: true
    }), {
      inventoryItemId: "gid://shopify/InventoryItem/1",
      locationId: "gid://shopify/Location/1",
      quantity: 8,
      compareQuantity: 5,
      reason: "correction",
      idempotencyKey: "store-agent:preview_123"
    }, {
      fetcher: async () => {
        called = true;
        return jsonResponse({});
      }
    });

    expect(result).toMatchObject({ ok: false, status: "blocked" });
    expect(called).toBe(false);
  });

  it("requires compareQuantity unless ignored explicitly", async () => {
    const result = await setInventoryQuantity(config(), {
      inventoryItemId: "gid://shopify/InventoryItem/1",
      locationId: "gid://shopify/Location/1",
      quantity: 8,
      reason: "correction",
      idempotencyKey: "store-agent:preview_123"
    });

    expect(result).toMatchObject({
      ok: false,
      status: "missing_input",
      diagnostics: [{ code: "missing_input" }]
    });
  });

  it("returns Shopify inventory user errors safely", async () => {
    const result = await setInventoryQuantity(config(), {
      inventoryItemId: "gid://shopify/InventoryItem/1",
      locationId: "gid://shopify/Location/1",
      quantity: 8,
      compareQuantity: 5,
      reason: "correction",
      idempotencyKey: "store-agent:preview_123"
    }, {
      fetcher: async () => jsonResponse({
        data: {
          inventorySetQuantities: {
            inventoryAdjustmentGroup: null,
            userErrors: [{ field: ["input", "quantities"], message: "compareQuantity is stale.", code: "COMPARE_QUANTITY_STALE" }]
          }
        }
      })
    });

    expect(result).toMatchObject({
      ok: false,
      status: "user_errors",
      userErrors: [{ field: ["input", "quantities"], message: "compareQuantity is stale." }]
    });
  });

  it("adjusts an explicit inventory quantity through inventoryAdjustQuantities", async () => {
    const requests: Array<{ body: string; token?: string }> = [];
    const fetcher: FetchLike = async (_url, init) => {
      requests.push({ body: init.body, token: init.headers["X-Shopify-Access-Token"] });
      return jsonResponse({
        data: {
          inventoryAdjustQuantities: {
            inventoryAdjustmentGroup: {
              reason: "Inventory correction",
              referenceDocumentUri: "gid://store-agent/TestRun/2",
              changes: [
                { name: "available", delta: -2, quantityAfterChange: 6 },
                { name: "on_hand", delta: -2, quantityAfterChange: 6 }
              ],
              rawNodeOnly: "do not return"
            },
            userErrors: []
          }
        }
      });
    };

    const result = await adjustInventoryQuantity(config(), {
      inventoryItemId: "gid://shopify/InventoryItem/1",
      locationId: "gid://shopify/Location/1",
      delta: -2,
      reason: "correction",
      referenceDocumentUri: "gid://store-agent/TestRun/2",
      idempotencyKey: "store-agent:preview_456"
    }, { fetcher });
    const request = JSON.parse(requests[0].body);
    const output = JSON.stringify(result);

    expect(result).toMatchObject({
      ok: true,
      status: "ok",
      inventoryAdjustment: {
        inventoryItemId: "gid://shopify/InventoryItem/1",
        locationId: "gid://shopify/Location/1",
        name: "available",
        delta: -2,
        changes: [
          { name: "available", delta: -2, quantityAfterChange: 6 },
          { name: "on_hand", delta: -2, quantityAfterChange: 6 }
        ]
      }
    });
    expect(requests).toHaveLength(1);
    expect(request.query).toContain("mutation ShopifyStoreAgentInventoryAdjustQuantities");
    expect(request.query).toContain("@idempotent");
    expect(request.query).not.toContain("inventorySetQuantities");
    expect(request.query).not.toContain("productUpdate");
    expect(request.variables).toEqual({
      input: {
        name: "available",
        reason: "correction",
        referenceDocumentUri: "gid://store-agent/TestRun/2",
        changes: [{
          inventoryItemId: "gid://shopify/InventoryItem/1",
          locationId: "gid://shopify/Location/1",
          delta: -2
        }]
      },
      idempotencyKey: "store-agent:preview_456"
    });
    expect(output).not.toContain("rawNodeOnly");
    expect(output).not.toContain("shpat_inventory_secret");
  });

  it("blocks inventory adjustment in read-only config before calling Shopify", async () => {
    let called = false;
    const result = await adjustInventoryQuantity(createConfig({
      storeUrl: "demo",
      adminAccessToken: "shpat_inventory_secret",
      readOnly: true
    }), {
      inventoryItemId: "gid://shopify/InventoryItem/1",
      locationId: "gid://shopify/Location/1",
      delta: 2,
      reason: "correction",
      idempotencyKey: "store-agent:preview_456"
    }, {
      fetcher: async () => {
        called = true;
        return jsonResponse({});
      }
    });

    expect(result).toMatchObject({ ok: false, status: "blocked" });
    expect(called).toBe(false);
  });

  it("requires a non-zero inventory adjustment delta", async () => {
    const result = await adjustInventoryQuantity(config(), {
      inventoryItemId: "gid://shopify/InventoryItem/1",
      locationId: "gid://shopify/Location/1",
      delta: 0,
      reason: "correction",
      idempotencyKey: "store-agent:preview_456"
    });

    expect(result).toMatchObject({
      ok: false,
      status: "missing_input",
      diagnostics: [{ code: "missing_input" }]
    });
  });

  it("returns Shopify inventory adjustment user errors safely", async () => {
    const result = await adjustInventoryQuantity(config(), {
      inventoryItemId: "gid://shopify/InventoryItem/1",
      locationId: "gid://shopify/Location/1",
      delta: -2,
      reason: "correction",
      idempotencyKey: "store-agent:preview_456"
    }, {
      fetcher: async () => jsonResponse({
        data: {
          inventoryAdjustQuantities: {
            inventoryAdjustmentGroup: null,
            userErrors: [{ field: ["input", "changes"], message: "Cannot adjust inventory.", code: "INVALID_QUANTITY" }]
          }
        }
      })
    });

    expect(result).toMatchObject({
      ok: false,
      status: "user_errors",
      userErrors: [{ field: ["input", "changes"], message: "Cannot adjust inventory." }]
    });
  });
});

function config() {
  return createConfig({
    storeUrl: "demo.myshopify.com",
    adminAccessToken: "shpat_inventory_secret",
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
