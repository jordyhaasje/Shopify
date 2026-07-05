import { describe, expect, it } from "vitest";
import { adjustInventoryQuantity, cancelInventoryTransfer, createConfig, createInventoryTransfer, markInventoryTransferReady, moveInventoryQuantity, receiveInventoryTransfer, setInventoryQuantity, shipInventoryTransfer, type FetchLike } from "../src/index.js";

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

  it("moves an explicit inventory quantity between states through inventoryMoveQuantities", async () => {
    const requests: Array<{ body: string; token?: string }> = [];
    const fetcher: FetchLike = async (_url, init) => {
      requests.push({ body: init.body, token: init.headers["X-Shopify-Access-Token"] });
      return jsonResponse({
        data: {
          inventoryMoveQuantities: {
            inventoryAdjustmentGroup: {
              reason: "Inventory reservation",
              referenceDocumentUri: "gid://store-agent/TestRun/3",
              changes: [
                { name: "available", delta: -3, quantityAfterChange: 5 },
                { name: "reserved", delta: 3, quantityAfterChange: 3 }
              ],
              rawNodeOnly: "do not return"
            },
            userErrors: []
          }
        }
      });
    };

    const result = await moveInventoryQuantity(config(), {
      inventoryItemId: "gid://shopify/InventoryItem/1",
      locationId: "gid://shopify/Location/1",
      quantity: 3,
      fromName: "available",
      toName: "reserved",
      reason: "reservation",
      referenceDocumentUri: "gid://store-agent/TestRun/3",
      idempotencyKey: "store-agent:preview_789"
    }, { fetcher });
    const request = JSON.parse(requests[0].body);
    const output = JSON.stringify(result);

    expect(result).toMatchObject({
      ok: true,
      status: "ok",
      inventoryMove: {
        inventoryItemId: "gid://shopify/InventoryItem/1",
        locationId: "gid://shopify/Location/1",
        quantity: 3,
        fromName: "available",
        toName: "reserved",
        changes: [
          { name: "available", delta: -3, quantityAfterChange: 5 },
          { name: "reserved", delta: 3, quantityAfterChange: 3 }
        ]
      }
    });
    expect(requests).toHaveLength(1);
    expect(request.query).toContain("mutation ShopifyStoreAgentInventoryMoveQuantities");
    expect(request.query).toContain("@idempotent");
    expect(request.query).not.toContain("inventorySetQuantities");
    expect(request.query).not.toContain("productUpdate");
    expect(request.variables).toEqual({
      input: {
        reason: "reservation",
        referenceDocumentUri: "gid://store-agent/TestRun/3",
        changes: [{
          quantity: 3,
          inventoryItemId: "gid://shopify/InventoryItem/1",
          from: {
            locationId: "gid://shopify/Location/1",
            name: "available",
            ledgerDocumentUri: null,
            changeFromQuantity: null
          },
          to: {
            locationId: "gid://shopify/Location/1",
            name: "reserved",
            ledgerDocumentUri: null,
            changeFromQuantity: null
          }
        }]
      },
      idempotencyKey: "store-agent:preview_789"
    });
    expect(output).not.toContain("rawNodeOnly");
    expect(output).not.toContain("shpat_inventory_secret");
  });

  it("blocks inventory move in read-only config before calling Shopify", async () => {
    let called = false;
    const result = await moveInventoryQuantity(createConfig({
      storeUrl: "demo",
      adminAccessToken: "shpat_inventory_secret",
      readOnly: true
    }), {
      inventoryItemId: "gid://shopify/InventoryItem/1",
      locationId: "gid://shopify/Location/1",
      quantity: 3,
      fromName: "available",
      toName: "reserved",
      reason: "reservation",
      idempotencyKey: "store-agent:preview_789"
    }, {
      fetcher: async () => {
        called = true;
        return jsonResponse({});
      }
    });

    expect(result).toMatchObject({ ok: false, status: "blocked" });
    expect(called).toBe(false);
  });

  it("requires a positive inventory move quantity and distinct states", async () => {
    const zero = await moveInventoryQuantity(config(), {
      inventoryItemId: "gid://shopify/InventoryItem/1",
      locationId: "gid://shopify/Location/1",
      quantity: 0,
      fromName: "available",
      toName: "reserved",
      reason: "reservation",
      idempotencyKey: "store-agent:preview_789"
    });
    const sameState = await moveInventoryQuantity(config(), {
      inventoryItemId: "gid://shopify/InventoryItem/1",
      locationId: "gid://shopify/Location/1",
      quantity: 3,
      fromName: "available",
      toName: "available",
      reason: "reservation",
      idempotencyKey: "store-agent:preview_789"
    });

    expect(zero).toMatchObject({
      ok: false,
      status: "missing_input",
      diagnostics: [{ code: "missing_input" }]
    });
    expect(sameState).toMatchObject({
      ok: false,
      status: "missing_input",
      diagnostics: [{ code: "missing_input" }]
    });
  });

  it("returns Shopify inventory move user errors safely", async () => {
    const result = await moveInventoryQuantity(config(), {
      inventoryItemId: "gid://shopify/InventoryItem/1",
      locationId: "gid://shopify/Location/1",
      quantity: 3,
      fromName: "available",
      toName: "reserved",
      reason: "reservation",
      idempotencyKey: "store-agent:preview_789"
    }, {
      fetcher: async () => jsonResponse({
        data: {
          inventoryMoveQuantities: {
            inventoryAdjustmentGroup: null,
            userErrors: [{ field: ["input", "changes"], message: "Cannot move inventory.", code: "INVALID_QUANTITY" }]
          }
        }
      })
    });

    expect(result).toMatchObject({
      ok: false,
      status: "user_errors",
      userErrors: [{ field: ["input", "changes"], message: "Cannot move inventory." }]
    });
  });

  it("creates an explicit inventory transfer draft through inventoryTransferCreate", async () => {
    const requests: Array<{ body: string; token?: string }> = [];
    const fetcher: FetchLike = async (_url, init) => {
      requests.push({ body: init.body, token: init.headers["X-Shopify-Access-Token"] });
      return jsonResponse({
        data: {
          inventoryTransferCreate: {
            inventoryTransfer: {
              id: "gid://shopify/InventoryTransfer/1",
              status: "DRAFT",
              rawNodeOnly: "do not return"
            },
            userErrors: []
          }
        }
      });
    };

    const result = await createInventoryTransfer(config(), {
      inventoryItemId: "gid://shopify/InventoryItem/1",
      fromLocationId: "gid://shopify/Location/1",
      toLocationId: "gid://shopify/Location/2",
      quantity: 4,
      reason: "rebalance",
      referenceDocumentUri: "gid://store-agent/TestRun/4",
      idempotencyKey: "store-agent:preview_transfer"
    }, { fetcher });
    const request = JSON.parse(requests[0].body);
    const output = JSON.stringify(result);

    expect(result).toMatchObject({
      ok: true,
      status: "ok",
      inventoryTransfer: {
        inventoryTransferId: "gid://shopify/InventoryTransfer/1",
        status: "DRAFT",
        inventoryItemId: "gid://shopify/InventoryItem/1",
        fromLocationId: "gid://shopify/Location/1",
        toLocationId: "gid://shopify/Location/2",
        quantity: 4
      }
    });
    expect(requests).toHaveLength(1);
    expect(request.query).toContain("mutation ShopifyStoreAgentInventoryTransferCreate");
    expect(request.query).toContain("@idempotent");
    expect(request.query).not.toContain("inventoryMoveQuantities");
    expect(request.query).not.toContain("inventorySetQuantities");
    expect(request.variables).toEqual({
      input: {
        originLocationId: "gid://shopify/Location/1",
        destinationLocationId: "gid://shopify/Location/2",
        lineItems: [{
          inventoryItemId: "gid://shopify/InventoryItem/1",
          quantity: 4
        }],
        note: "rebalance",
        referenceName: "gid://store-agent/TestRun/4"
      },
      idempotencyKey: "store-agent:preview_transfer"
    });
    expect(output).not.toContain("rawNodeOnly");
    expect(output).not.toContain("shpat_inventory_secret");
  });

  it("marks an explicit inventory transfer ready to ship", async () => {
    const requests: Array<{ body: string; token?: string }> = [];
    const fetcher: FetchLike = async (_url, init) => {
      requests.push({ body: init.body, token: init.headers["X-Shopify-Access-Token"] });
      return jsonResponse({
        data: {
          inventoryTransferMarkAsReadyToShip: {
            inventoryTransfer: {
              id: "gid://shopify/InventoryTransfer/1",
              status: "READY_TO_SHIP",
              rawNodeOnly: "do not return"
            },
            userErrors: []
          }
        }
      });
    };

    const result = await markInventoryTransferReady(config(), {
      inventoryTransferId: "gid://shopify/InventoryTransfer/1"
    }, { fetcher });
    const request = JSON.parse(requests[0].body);
    const output = JSON.stringify(result);

    expect(result).toMatchObject({
      ok: true,
      status: "ok",
      inventoryTransfer: {
        inventoryTransferId: "gid://shopify/InventoryTransfer/1",
        status: "READY_TO_SHIP"
      }
    });
    expect(requests).toHaveLength(1);
    expect(request.query).toContain("mutation ShopifyStoreAgentInventoryTransferMarkReady");
    expect(request.query).toContain("inventoryTransferMarkAsReadyToShip");
    expect(request.query).not.toContain("inventoryTransferCreate");
    expect(request.query).not.toContain("@idempotent");
    expect(request.variables).toEqual({
      id: "gid://shopify/InventoryTransfer/1"
    });
    expect(output).not.toContain("rawNodeOnly");
    expect(output).not.toContain("shpat_inventory_secret");
  });

  it("cancels an explicit inventory transfer", async () => {
    const requests: Array<{ body: string; token?: string }> = [];
    const fetcher: FetchLike = async (_url, init) => {
      requests.push({ body: init.body, token: init.headers["X-Shopify-Access-Token"] });
      return jsonResponse({
        data: {
          inventoryTransferCancel: {
            inventoryTransfer: {
              id: "gid://shopify/InventoryTransfer/1",
              status: "CANCELLED",
              rawNodeOnly: "do not return"
            },
            userErrors: []
          }
        }
      });
    };

    const result = await cancelInventoryTransfer(config(), {
      inventoryTransferId: "gid://shopify/InventoryTransfer/1"
    }, { fetcher });
    const request = JSON.parse(requests[0].body);
    const output = JSON.stringify(result);

    expect(result).toMatchObject({
      ok: true,
      status: "ok",
      inventoryTransfer: {
        inventoryTransferId: "gid://shopify/InventoryTransfer/1",
        status: "CANCELLED"
      }
    });
    expect(requests).toHaveLength(1);
    expect(request.query).toContain("mutation ShopifyStoreAgentInventoryTransferCancel");
    expect(request.query).toContain("inventoryTransferCancel");
    expect(request.query).not.toContain("inventoryTransferMarkAsReadyToShip");
    expect(request.query).not.toContain("inventoryTransferCreate");
    expect(request.query).not.toContain("@idempotent");
    expect(request.variables).toEqual({
      id: "gid://shopify/InventoryTransfer/1"
    });
    expect(output).not.toContain("rawNodeOnly");
    expect(output).not.toContain("shpat_inventory_secret");
  });

  it("ships an explicit inventory transfer item quantity", async () => {
    const requests: Array<{ body: string; token?: string }> = [];
    const fetcher: FetchLike = async (_url, init) => {
      requests.push({ body: init.body, token: init.headers["X-Shopify-Access-Token"] });
      return jsonResponse({
        data: {
          inventoryShipmentCreateInTransit: {
            inventoryShipment: {
              id: "gid://shopify/InventoryShipment/1",
              status: "IN_TRANSIT",
              rawNodeOnly: "do not return"
            },
            userErrors: []
          }
        }
      });
    };

    const result = await shipInventoryTransfer(config(), {
      inventoryTransferId: "gid://shopify/InventoryTransfer/1",
      inventoryItemId: "gid://shopify/InventoryItem/1",
      quantity: 3,
      idempotencyKey: "store-agent:preview_ship"
    }, { fetcher });
    const request = JSON.parse(requests[0].body);
    const output = JSON.stringify(result);

    expect(result).toMatchObject({
      ok: true,
      status: "ok",
      inventoryShipment: {
        inventoryTransferId: "gid://shopify/InventoryTransfer/1",
        inventoryShipmentId: "gid://shopify/InventoryShipment/1",
        status: "IN_TRANSIT",
        inventoryItemId: "gid://shopify/InventoryItem/1",
        quantity: 3
      }
    });
    expect(requests).toHaveLength(1);
    expect(request.query).toContain("mutation ShopifyStoreAgentInventoryShipmentCreateInTransit");
    expect(request.query).toContain("inventoryShipmentCreateInTransit");
    expect(request.query).toContain("@idempotent");
    expect(request.query).not.toContain("inventoryTransferCancel");
    expect(request.query).not.toContain("inventoryTransferMarkAsReadyToShip");
    expect(request.variables).toEqual({
      input: {
        movementId: "gid://shopify/InventoryTransfer/1",
        lineItems: [{
          inventoryItemId: "gid://shopify/InventoryItem/1",
          quantity: 3
        }]
      },
      idempotencyKey: "store-agent:preview_ship"
    });
    expect(output).not.toContain("rawNodeOnly");
    expect(output).not.toContain("shpat_inventory_secret");
  });

  it("receives an explicit inventory shipment line item quantity", async () => {
    const requests: Array<{ body: string; token?: string }> = [];
    const fetcher: FetchLike = async (_url, init) => {
      requests.push({ body: init.body, token: init.headers["X-Shopify-Access-Token"] });
      return jsonResponse({
        data: {
          inventoryShipmentReceive: {
            inventoryShipment: {
              id: "gid://shopify/InventoryShipment/1",
              status: "RECEIVED",
              rawNodeOnly: "do not return"
            },
            userErrors: []
          }
        }
      });
    };

    const result = await receiveInventoryTransfer(config(), {
      inventoryShipmentId: "gid://shopify/InventoryShipment/1",
      shipmentLineItemId: "gid://shopify/InventoryShipmentLineItem/1",
      quantity: 2,
      reason: "ACCEPTED",
      idempotencyKey: "store-agent:preview_receive"
    }, { fetcher });
    const request = JSON.parse(requests[0].body);
    const output = JSON.stringify(result);

    expect(result).toMatchObject({
      ok: true,
      status: "ok",
      inventoryShipment: {
        inventoryShipmentId: "gid://shopify/InventoryShipment/1",
        status: "RECEIVED",
        shipmentLineItemId: "gid://shopify/InventoryShipmentLineItem/1",
        quantity: 2,
        reason: "ACCEPTED"
      }
    });
    expect(requests).toHaveLength(1);
    expect(request.query).toContain("mutation ShopifyStoreAgentInventoryShipmentReceive");
    expect(request.query).toContain("inventoryShipmentReceive");
    expect(request.query).toContain("@idempotent");
    expect(request.query).not.toContain("inventoryShipmentCreateInTransit");
    expect(request.query).not.toContain("inventoryTransferCancel");
    expect(request.variables).toEqual({
      id: "gid://shopify/InventoryShipment/1",
      lineItems: [{
        shipmentLineItemId: "gid://shopify/InventoryShipmentLineItem/1",
        quantity: 2,
        reason: "ACCEPTED"
      }],
      idempotencyKey: "store-agent:preview_receive"
    });
    expect(output).not.toContain("rawNodeOnly");
    expect(output).not.toContain("shpat_inventory_secret");
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
