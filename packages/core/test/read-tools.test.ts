import { describe, expect, it } from "vitest";
import { createConfig } from "../src/config.js";
import { findCustomers, findOrders, getOrder, getProduct, getTracking } from "../src/read-tools.js";
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
