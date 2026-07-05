import { describe, expect, it } from "vitest";
import { createConfig } from "../src/config.js";
import { findCustomers, findOrders, getOrder, getProduct, getTracking, lookupInventory, lookupInventoryLocations } from "../src/read-tools.js";
import type { FetchLike } from "../src/shopify-client.js";

const config = createConfig({
  storeUrl: "demo",
  adminAccessToken: "shpat_test_secret"
});

function fetchJson(body: unknown): FetchLike {
  return async () => ({
    ok: true,
    status: 200,
    async text() {
      return JSON.stringify(body);
    }
  });
}

describe("read-only Shopify helpers", () => {
  it("finds one order with minimal shaped output", async () => {
    const result = await findOrders(config, { orderNumber: "1001" }, {
      fetcher: fetchJson({
        data: {
          orders: {
            nodes: [orderNode("gid://shopify/Order/1", "#1001")]
          }
        }
      })
    });

    expect(result).toMatchObject({
      ok: true,
      status: "ok",
      matches: [{
        id: "gid://shopify/Order/1",
        name: "#1001",
        customer: {
          id: "gid://shopify/Customer/1",
          email: "customer@example.com"
        },
        tracking: [{
          company: "DHL",
          number: "TRACK1"
        }]
      }]
    });
    expect(JSON.stringify(result)).not.toContain("rawNodeOnly");
  });

  it("returns no matches for order.find when Shopify returns none", async () => {
    const result = await findOrders(config, { email: "none@example.com" }, {
      fetcher: fetchJson({ data: { orders: { nodes: [] } } })
    });

    expect(result).toMatchObject({ ok: true, status: "not_found", matches: [] });
  });

  it("returns multiple matches for order.find", async () => {
    const result = await findOrders(config, { email: "customer@example.com" }, {
      fetcher: fetchJson({
        data: {
          orders: {
            nodes: [
              orderNode("gid://shopify/Order/1", "#1001"),
              orderNode("gid://shopify/Order/2", "#1002")
            ]
          }
        }
      })
    });

    expect(result.status).toBe("multiple_matches");
    expect(result.matches).toHaveLength(2);
  });

  it("gets one order by ID", async () => {
    const result = await getOrder(config, { id: "gid://shopify/Order/1" }, {
      fetcher: fetchJson({
        data: {
          node: { __typename: "Order", ...orderNode("gid://shopify/Order/1", "#1001") }
        }
      })
    });

    expect(result).toMatchObject({
      ok: true,
      status: "ok",
      item: { id: "gid://shopify/Order/1", name: "#1001" }
    });
  });

  it("returns diagnostics for order.get access denied", async () => {
    const result = await getOrder(config, { id: "gid://shopify/Order/1" }, {
      fetcher: fetchJson({
        errors: [{ message: "Access denied for order", extensions: { code: "ACCESS_DENIED" } }]
      })
    });

    expect(result).toMatchObject({
      ok: false,
      status: "shopify_error",
      diagnostics: [{ code: "access_denied" }]
    });
    expect(JSON.stringify(result)).not.toContain("shpat_test_secret");
  });

  it("finds customers with minimal shaped output", async () => {
    const result = await findCustomers(config, { email: "customer@example.com" }, {
      fetcher: fetchJson({
        data: {
          customers: {
            nodes: [{ id: "gid://shopify/Customer/1", displayName: "Customer One", email: "customer@example.com", numberOfOrders: "3", rawNodeOnly: true }]
          }
        }
      })
    });

    expect(result).toMatchObject({
      ok: true,
      matches: [{ id: "gid://shopify/Customer/1", displayName: "Customer One", email: "customer@example.com" }]
    });
    expect(JSON.stringify(result)).not.toContain("rawNodeOnly");
  });

  it("returns no matches for customer.find", async () => {
    const result = await findCustomers(config, { query: "name:nobody" }, {
      fetcher: fetchJson({ data: { customers: { nodes: [] } } })
    });

    expect(result).toMatchObject({ ok: true, status: "not_found", matches: [] });
  });

  it("gets tracking from an order", async () => {
    const result = await getTracking(config, { orderId: "gid://shopify/Order/1" }, {
      fetcher: fetchJson({
        data: {
          node: { __typename: "Order", ...orderNode("gid://shopify/Order/1", "#1001") }
        }
      })
    });

    expect(result).toMatchObject({
      ok: true,
      status: "ok",
      matches: [{ orderName: "#1001", company: "DHL", number: "TRACK1" }]
    });
  });

  it("returns no tracking matches when no tracking is present", async () => {
    const order = orderNode("gid://shopify/Order/1", "#1001");
    order.fulfillments = [];
    const result = await getTracking(config, { orderId: "gid://shopify/Order/1" }, {
      fetcher: fetchJson({ data: { node: { __typename: "Order", ...order } } })
    });

    expect(result).toMatchObject({ ok: true, status: "not_found", matches: [] });
  });

  it("requires explicit input for read helpers", async () => {
    await expect(findOrders(config, {})).resolves.toMatchObject({ ok: false, status: "missing_input" });
    await expect(findCustomers(config, {})).resolves.toMatchObject({ ok: false, status: "missing_input" });
    await expect(getTracking(config, {})).resolves.toMatchObject({ ok: false, status: "missing_input" });
    await expect(getProduct(config, {})).resolves.toMatchObject({ ok: false, status: "missing_input" });
  });

  it("gets a product by handle", async () => {
    const result = await getProduct(config, { handle: "shirt" }, {
      fetcher: fetchJson({
        data: {
          productByHandle: {
            id: "gid://shopify/Product/1",
            title: "Shirt",
            handle: "shirt",
            status: "ACTIVE",
            vendor: "Demo",
            productType: "Apparel",
            rawNodeOnly: true
          }
        }
      })
    });

    expect(result).toMatchObject({
      ok: true,
      item: {
        id: "gid://shopify/Product/1",
        title: "Shirt",
        handle: "shirt"
      }
    });
    expect(JSON.stringify(result)).not.toContain("rawNodeOnly");
  });

  it("returns product not found", async () => {
    const result = await getProduct(config, { handle: "missing" }, {
      fetcher: fetchJson({ data: { productByHandle: null } })
    });

    expect(result).toMatchObject({ ok: false, status: "not_found" });
  });

  it("looks up inventory by item ID with compact variant and location output", async () => {
    const result = await lookupInventory(config, { inventoryItemId: "gid://shopify/InventoryItem/1" }, {
      fetcher: fetchJson({
        data: {
          inventoryItem: inventoryItemNode()
        }
      })
    });

    expect(result).toMatchObject({
      ok: true,
      status: "ok",
      item: {
        inventoryItemId: "gid://shopify/InventoryItem/1",
        sku: "SKU-1",
        tracked: true,
        variants: [{
          id: "gid://shopify/ProductVariant/1",
          sku: "SKU-1",
          product: {
            id: "gid://shopify/Product/1",
            title: "Shirt"
          }
        }],
        levels: [{
          id: "gid://shopify/InventoryLevel/1?inventory_item_id=1",
          locationId: "gid://shopify/Location/1",
          locationName: "Main",
          availableQuantity: 7,
          quantities: expect.arrayContaining([{ name: "available", quantity: 7 }])
        }]
      }
    });
    expect(JSON.stringify(result)).not.toContain("rawNodeOnly");
  });

  it("looks up inventory by variant ID", async () => {
    const result = await lookupInventory(config, { variantId: "gid://shopify/ProductVariant/1" }, {
      fetcher: fetchJson({
        data: {
          node: {
            __typename: "ProductVariant",
            id: "gid://shopify/ProductVariant/1",
            title: "Small",
            sku: "SKU-1",
            product: { id: "gid://shopify/Product/1", title: "Shirt", handle: "shirt" },
            inventoryItem: inventoryItemNode()
          }
        }
      })
    });

    expect(result).toMatchObject({
      ok: true,
      item: {
        inventoryItemId: "gid://shopify/InventoryItem/1",
        variants: [{ id: "gid://shopify/ProductVariant/1" }]
      }
    });
  });

  it("looks up inventory by SKU and reports multiple explicit matches", async () => {
    const requests: Array<{ body: string }> = [];
    const result = await lookupInventory(config, { sku: "SKU-1", first: 2 }, {
      fetcher: async (_url, init) => {
        requests.push({ body: init.body });
        return {
          ok: true,
          status: 200,
          async text() {
            return JSON.stringify({
              data: {
                productVariants: {
                  nodes: [
                    { id: "gid://shopify/ProductVariant/1", title: "Small", sku: "SKU-1", product: { id: "gid://shopify/Product/1", title: "Shirt" }, inventoryItem: inventoryItemNode("1") },
                    { id: "gid://shopify/ProductVariant/2", title: "Large", sku: "SKU-1", product: { id: "gid://shopify/Product/2", title: "Hat" }, inventoryItem: inventoryItemNode("2") }
                  ]
                }
              }
            });
          }
        };
      }
    });

    expect(result).toMatchObject({
      ok: true,
      status: "multiple_matches",
      matches: [
        { inventoryItemId: "gid://shopify/InventoryItem/1" },
        { inventoryItemId: "gid://shopify/InventoryItem/2" }
      ]
    });
    expect(JSON.parse(requests[0].body).variables.query).toBe("sku:SKU-1");
  });

  it("requires exactly one inventory lookup input", async () => {
    await expect(lookupInventory(config, {})).resolves.toMatchObject({ ok: false, status: "missing_input" });
    await expect(lookupInventory(config, {
      inventoryItemId: "gid://shopify/InventoryItem/1",
      sku: "SKU-1"
    })).resolves.toMatchObject({ ok: false, status: "missing_input" });
  });

  it("looks up an inventory location by explicit ID with compact output", async () => {
    const result = await lookupInventoryLocations(config, { locationId: "gid://shopify/Location/1" }, {
      fetcher: fetchJson({
        data: {
          node: {
            __typename: "Location",
            id: "gid://shopify/Location/1",
            name: "Main",
            isActive: true,
            fulfillsOnlineOrders: true,
            rawNodeOnly: true
          }
        }
      })
    });

    expect(result).toMatchObject({
      ok: true,
      status: "ok",
      item: {
        id: "gid://shopify/Location/1",
        name: "Main",
        isActive: true,
        fulfillsOnlineOrders: true
      }
    });
    expect(JSON.stringify(result)).not.toContain("rawNodeOnly");
    expect(JSON.stringify(result)).not.toContain("shpat_test_secret");
  });

  it("looks up inventory locations by explicit name query", async () => {
    const requests: Array<{ body: string }> = [];
    const result = await lookupInventoryLocations(config, { name: "Main Warehouse", first: 2 }, {
      fetcher: async (_url, init) => {
        requests.push({ body: init.body });
        return {
          ok: true,
          status: 200,
          async text() {
            return JSON.stringify({
              data: {
                locations: {
                  nodes: [
                    { id: "gid://shopify/Location/1", name: "Main Warehouse", isActive: true, fulfillsOnlineOrders: true, rawNodeOnly: true },
                    { id: "gid://shopify/Location/2", name: "Main Warehouse Overflow", isActive: true, fulfillsOnlineOrders: false }
                  ]
                }
              }
            });
          }
        };
      }
    });

    expect(result).toMatchObject({
      ok: true,
      status: "multiple_matches",
      matches: [
        { id: "gid://shopify/Location/1", name: "Main Warehouse" },
        { id: "gid://shopify/Location/2", name: "Main Warehouse Overflow" }
      ]
    });
    expect(JSON.parse(requests[0].body).variables).toMatchObject({
      query: 'name:"Main Warehouse"',
      first: 2,
      includeInactive: false,
      includeLegacy: false
    });
    expect(JSON.stringify(result)).not.toContain("rawNodeOnly");
  });

  it("requires exactly one inventory location lookup input", async () => {
    await expect(lookupInventoryLocations(config, {})).resolves.toMatchObject({ ok: false, status: "missing_input" });
    await expect(lookupInventoryLocations(config, {
      locationId: "gid://shopify/Location/1",
      name: "Main"
    })).resolves.toMatchObject({ ok: false, status: "missing_input" });
  });
});

function orderNode(id: string, name: string) {
  return {
    id,
    name,
    createdAt: "2026-07-03T00:00:00Z",
    displayFinancialStatus: "PAID",
    displayFulfillmentStatus: "FULFILLED",
    rawNodeOnly: true,
    customer: {
      id: "gid://shopify/Customer/1",
      displayName: "Customer One",
      email: "customer@example.com"
    },
    totalPriceSet: {
      shopMoney: {
        amount: "49.95",
        currencyCode: "EUR"
      }
    },
    fulfillments: [{
      id: "gid://shopify/Fulfillment/1",
      status: "SUCCESS",
      trackingInfo: [{
        company: "DHL",
        number: "TRACK1",
        url: "https://example.com/track/TRACK1"
      }]
    }]
  };
}

function inventoryItemNode(suffix = "1") {
  return {
    id: `gid://shopify/InventoryItem/${suffix}`,
    sku: `SKU-${suffix}`,
    tracked: true,
    rawNodeOnly: true,
    variants: {
      nodes: [{
        id: `gid://shopify/ProductVariant/${suffix}`,
        title: "Small",
        sku: `SKU-${suffix}`,
        product: {
          id: `gid://shopify/Product/${suffix}`,
          title: "Shirt",
          handle: "shirt"
        },
        rawNodeOnly: true
      }]
    },
    inventoryLevels: {
      nodes: [{
        id: `gid://shopify/InventoryLevel/${suffix}?inventory_item_id=${suffix}`,
        rawNodeOnly: true,
        location: {
          id: `gid://shopify/Location/${suffix}`,
          name: "Main"
        },
        quantities: [
          { name: "available", quantity: 7, rawNodeOnly: true },
          { name: "on_hand", quantity: 10 }
        ]
      }]
    }
  };
}
