import { describe, expect, it } from "vitest";
import { createConfig, setInventoryQuantity, type FetchLike } from "../src/index.js";

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
