import { describe, expect, it } from "vitest";
import { checkWriteScopePreflight, createConfig } from "../src/index.js";

describe("write scope preflight", () => {
  it("blocks page create when granted scopes are unknown", () => {
    const result = checkWriteScopePreflight(createConfig({
      storeUrl: "demo",
      readOnly: false
    }), "page.create.execute");

    expect(result).toMatchObject({
      ok: false,
      status: "blocked",
      grantedScopesKnown: false,
      requiredScopes: ["write_content", "write_online_store_pages"],
      diagnostics: [{ code: "unknown_write_scopes" }]
    });
  });

  it("blocks page create when known scopes miss page write scope", () => {
    const result = checkWriteScopePreflight(createConfig({
      storeUrl: "demo",
      readOnly: false,
      grantedScopes: ["read_content", "shpat_scope_secret"]
    }), "page.create.execute");
    const output = JSON.stringify(result);

    expect(result).toMatchObject({
      ok: false,
      status: "blocked",
      grantedScopesKnown: true,
      diagnostics: [{ code: "missing_write_scope" }]
    });
    expect(output).not.toContain("shpat_scope_secret");
  });

  it("allows page create when either accepted page write scope is known", () => {
    expect(checkWriteScopePreflight(createConfig({
      storeUrl: "demo",
      readOnly: false,
      grantedScopes: ["write_content"]
    }), "page.create.execute")).toMatchObject({ ok: true, status: "ok" });

    expect(checkWriteScopePreflight(createConfig({
      storeUrl: "demo",
      readOnly: false,
      grantedScopes: ["write_online_store_pages"]
    }), "page.create.execute")).toMatchObject({ ok: true, status: "ok" });
  });

  it("blocks product create when granted scopes are unknown", () => {
    const result = checkWriteScopePreflight(createConfig({
      storeUrl: "demo",
      readOnly: false
    }), "product.create.execute");

    expect(result).toMatchObject({
      ok: false,
      status: "blocked",
      grantedScopesKnown: false,
      requiredScopes: ["write_products"],
      diagnostics: [{ code: "unknown_write_scopes" }]
    });
  });

  it("blocks product create when known scopes miss write_products", () => {
    const result = checkWriteScopePreflight(createConfig({
      storeUrl: "demo",
      readOnly: false,
      grantedScopes: ["read_products", "shpat_scope_secret"]
    }), "product.create.execute");
    const output = JSON.stringify(result);

    expect(result).toMatchObject({
      ok: false,
      status: "blocked",
      grantedScopesKnown: true,
      requiredScopes: ["write_products"],
      diagnostics: [{ code: "missing_write_scope" }]
    });
    expect(output).not.toContain("shpat_scope_secret");
  });

  it("allows product create when write_products is known", () => {
    expect(checkWriteScopePreflight(createConfig({
      storeUrl: "demo",
      readOnly: false,
      grantedScopes: ["write_products"]
    }), "product.create.execute")).toMatchObject({
      ok: true,
      status: "ok",
      requiredScopes: ["write_products"]
    });
  });

  it("blocks product update when granted scopes are unknown", () => {
    const result = checkWriteScopePreflight(createConfig({
      storeUrl: "demo",
      readOnly: false
    }), "product.update.execute");

    expect(result).toMatchObject({
      ok: false,
      status: "blocked",
      grantedScopesKnown: false,
      requiredScopes: ["write_products"],
      diagnostics: [{ code: "unknown_write_scopes" }]
    });
  });

  it("blocks product update when known scopes miss write_products", () => {
    const result = checkWriteScopePreflight(createConfig({
      storeUrl: "demo",
      readOnly: false,
      grantedScopes: ["read_products", "shpat_scope_secret"]
    }), "product.update.execute");
    const output = JSON.stringify(result);

    expect(result).toMatchObject({
      ok: false,
      status: "blocked",
      grantedScopesKnown: true,
      requiredScopes: ["write_products"],
      diagnostics: [{ code: "missing_write_scope" }]
    });
    expect(output).not.toContain("shpat_scope_secret");
  });

  it("allows product update when write_products is known", () => {
    expect(checkWriteScopePreflight(createConfig({
      storeUrl: "demo",
      readOnly: false,
      grantedScopes: ["write_products"]
    }), "product.update.execute")).toMatchObject({
      ok: true,
      status: "ok",
      requiredScopes: ["write_products"]
    });
  });

  it("blocks product media update when known scopes miss write_products", () => {
    const result = checkWriteScopePreflight(createConfig({
      storeUrl: "demo",
      readOnly: false,
      grantedScopes: ["read_products", "shpat_scope_secret"]
    }), "product.media.update.execute");
    const output = JSON.stringify(result);

    expect(result).toMatchObject({
      ok: false,
      status: "blocked",
      grantedScopesKnown: true,
      requiredScopes: ["write_products"],
      diagnostics: [{ code: "missing_write_scope" }]
    });
    expect(output).not.toContain("shpat_scope_secret");
  });

  it("allows product media update when write_products is known", () => {
    expect(checkWriteScopePreflight(createConfig({
      storeUrl: "demo",
      readOnly: false,
      grantedScopes: ["write_products"]
    }), "product.media.update.execute")).toMatchObject({
      ok: true,
      status: "ok",
      requiredScopes: ["write_products"]
    });
  });

  it("blocks collection create when granted scopes are unknown", () => {
    const result = checkWriteScopePreflight(createConfig({
      storeUrl: "demo",
      readOnly: false
    }), "collection.create.execute");

    expect(result).toMatchObject({
      ok: false,
      status: "blocked",
      grantedScopesKnown: false,
      requiredScopes: ["write_products"],
      diagnostics: [{ code: "unknown_write_scopes" }]
    });
  });

  it("blocks collection create when known scopes miss write_products", () => {
    const result = checkWriteScopePreflight(createConfig({
      storeUrl: "demo",
      readOnly: false,
      grantedScopes: ["read_products", "shpat_scope_secret"]
    }), "collection.create.execute");
    const output = JSON.stringify(result);

    expect(result).toMatchObject({
      ok: false,
      status: "blocked",
      grantedScopesKnown: true,
      requiredScopes: ["write_products"],
      diagnostics: [{ code: "missing_write_scope" }]
    });
    expect(output).not.toContain("shpat_scope_secret");
  });

  it("allows collection create when write_products is known", () => {
    expect(checkWriteScopePreflight(createConfig({
      storeUrl: "demo",
      readOnly: false,
      grantedScopes: ["write_products"]
    }), "collection.create.execute")).toMatchObject({
      ok: true,
      status: "ok",
      requiredScopes: ["write_products"]
    });
  });

  it("blocks inventory set quantity when known scopes miss write_inventory", () => {
    const result = checkWriteScopePreflight(createConfig({
      storeUrl: "demo",
      readOnly: false,
      grantedScopes: ["read_inventory", "shpat_scope_secret"]
    }), "inventory.setQuantity.execute");
    const output = JSON.stringify(result);

    expect(result).toMatchObject({
      ok: false,
      status: "blocked",
      grantedScopesKnown: true,
      requiredScopes: ["write_inventory"],
      diagnostics: [{ code: "missing_write_scope" }]
    });
    expect(output).not.toContain("shpat_scope_secret");
  });

  it("allows inventory set quantity when write_inventory is known", () => {
    expect(checkWriteScopePreflight(createConfig({
      storeUrl: "demo",
      readOnly: false,
      grantedScopes: ["write_inventory"]
    }), "inventory.setQuantity.execute")).toMatchObject({
      ok: true,
      status: "ok",
      requiredScopes: ["write_inventory"]
    });
  });

  it("blocks inventory adjustment when known scopes miss write_inventory", () => {
    const result = checkWriteScopePreflight(createConfig({
      storeUrl: "demo",
      readOnly: false,
      grantedScopes: ["read_inventory"]
    }), "inventory.adjustQuantity.execute");

    expect(result).toMatchObject({
      ok: false,
      status: "blocked",
      grantedScopesKnown: true,
      requiredScopes: ["write_inventory"],
      diagnostics: [{ code: "missing_write_scope" }]
    });
  });

  it("allows inventory adjustment when write_inventory is known", () => {
    expect(checkWriteScopePreflight(createConfig({
      storeUrl: "demo",
      readOnly: false,
      grantedScopes: ["write_inventory"]
    }), "inventory.adjustQuantity.execute")).toMatchObject({
      ok: true,
      status: "ok",
      requiredScopes: ["write_inventory"]
    });
  });

  it("blocks inventory move when known scopes miss write_inventory", () => {
    const result = checkWriteScopePreflight(createConfig({
      storeUrl: "demo",
      readOnly: false,
      grantedScopes: ["read_inventory"]
    }), "inventory.moveQuantity.execute");

    expect(result).toMatchObject({
      ok: false,
      status: "blocked",
      grantedScopesKnown: true,
      requiredScopes: ["write_inventory"],
      diagnostics: [{ code: "missing_write_scope" }]
    });
  });

  it("allows inventory move when write_inventory is known", () => {
    expect(checkWriteScopePreflight(createConfig({
      storeUrl: "demo",
      readOnly: false,
      grantedScopes: ["write_inventory"]
    }), "inventory.moveQuantity.execute")).toMatchObject({
      ok: true,
      status: "ok",
      requiredScopes: ["write_inventory"]
    });
  });

  it("blocks inventory transfer unless both transfer scopes are known", () => {
    const result = checkWriteScopePreflight(createConfig({
      storeUrl: "demo",
      readOnly: false,
      grantedScopes: ["write_inventory_transfers"]
    }), "inventory.transfer.execute");

    expect(result).toMatchObject({
      ok: false,
      status: "blocked",
      grantedScopesKnown: true,
      requiredScopes: ["write_inventory_transfers", "read_inventory_transfers"],
      diagnostics: [{ code: "missing_write_scope" }]
    });
  });

  it("allows inventory transfer when read and write transfer scopes are known", () => {
    expect(checkWriteScopePreflight(createConfig({
      storeUrl: "demo",
      readOnly: false,
      grantedScopes: ["write_inventory_transfers", "read_inventory_transfers"]
    }), "inventory.transfer.execute")).toMatchObject({
      ok: true,
      status: "ok",
      requiredScopes: ["write_inventory_transfers", "read_inventory_transfers"]
    });
  });

  it("blocks inventory transfer add-items unless transfer and inventory read scopes are known", () => {
    const result = checkWriteScopePreflight(createConfig({
      storeUrl: "demo",
      readOnly: false,
      grantedScopes: ["write_inventory_transfers", "read_inventory_transfers"]
    }), "inventory.transfer.addItems.execute");

    expect(result).toMatchObject({
      ok: false,
      status: "blocked",
      grantedScopesKnown: true,
      requiredScopes: ["write_inventory_transfers", "read_inventory_transfers", "read_inventory"],
      diagnostics: [{ code: "missing_write_scope" }]
    });
  });

  it("allows inventory transfer add-items when transfer and inventory read scopes are known", () => {
    expect(checkWriteScopePreflight(createConfig({
      storeUrl: "demo",
      readOnly: false,
      grantedScopes: ["write_inventory_transfers", "read_inventory_transfers", "read_inventory"]
    }), "inventory.transfer.addItems.execute")).toMatchObject({
      ok: true,
      status: "ok",
      requiredScopes: ["write_inventory_transfers", "read_inventory_transfers", "read_inventory"]
    });
  });

  it("blocks inventory transfer mark-ready unless both transfer scopes are known", () => {
    const result = checkWriteScopePreflight(createConfig({
      storeUrl: "demo",
      readOnly: false,
      grantedScopes: ["write_inventory_transfers"]
    }), "inventory.transfer.markReady.execute");

    expect(result).toMatchObject({
      ok: false,
      status: "blocked",
      grantedScopesKnown: true,
      requiredScopes: ["write_inventory_transfers", "read_inventory_transfers"],
      diagnostics: [{ code: "missing_write_scope" }]
    });
  });

  it("allows inventory transfer mark-ready when read and write transfer scopes are known", () => {
    expect(checkWriteScopePreflight(createConfig({
      storeUrl: "demo",
      readOnly: false,
      grantedScopes: ["write_inventory_transfers", "read_inventory_transfers"]
    }), "inventory.transfer.markReady.execute")).toMatchObject({
      ok: true,
      status: "ok",
      requiredScopes: ["write_inventory_transfers", "read_inventory_transfers"]
    });
  });

  it("blocks inventory transfer cancel unless both transfer scopes are known", () => {
    const result = checkWriteScopePreflight(createConfig({
      storeUrl: "demo",
      readOnly: false,
      grantedScopes: ["write_inventory_transfers"]
    }), "inventory.transfer.cancel.execute");

    expect(result).toMatchObject({
      ok: false,
      status: "blocked",
      grantedScopesKnown: true,
      requiredScopes: ["write_inventory_transfers", "read_inventory_transfers"],
      diagnostics: [{ code: "missing_write_scope" }]
    });
  });

  it("allows inventory transfer cancel when read and write transfer scopes are known", () => {
    expect(checkWriteScopePreflight(createConfig({
      storeUrl: "demo",
      readOnly: false,
      grantedScopes: ["write_inventory_transfers", "read_inventory_transfers"]
    }), "inventory.transfer.cancel.execute")).toMatchObject({
      ok: true,
      status: "ok",
      requiredScopes: ["write_inventory_transfers", "read_inventory_transfers"]
    });
  });

  it("blocks inventory transfer ship unless both shipment scopes are known", () => {
    const result = checkWriteScopePreflight(createConfig({
      storeUrl: "demo",
      readOnly: false,
      grantedScopes: ["write_inventory_shipments"]
    }), "inventory.transfer.ship.execute");

    expect(result).toMatchObject({
      ok: false,
      status: "blocked",
      grantedScopesKnown: true,
      requiredScopes: ["write_inventory_shipments", "read_inventory_shipments"],
      diagnostics: [{ code: "missing_write_scope" }]
    });
  });

  it("allows inventory transfer ship when read and write shipment scopes are known", () => {
    expect(checkWriteScopePreflight(createConfig({
      storeUrl: "demo",
      readOnly: false,
      grantedScopes: ["write_inventory_shipments", "read_inventory_shipments"]
    }), "inventory.transfer.ship.execute")).toMatchObject({
      ok: true,
      status: "ok",
      requiredScopes: ["write_inventory_shipments", "read_inventory_shipments"]
    });
  });

  it("blocks inventory transfer receive unless received-items and read shipment scopes are known", () => {
    const result = checkWriteScopePreflight(createConfig({
      storeUrl: "demo",
      readOnly: false,
      grantedScopes: ["write_inventory_shipments_received_items"]
    }), "inventory.transfer.receive.execute");

    expect(result).toMatchObject({
      ok: false,
      status: "blocked",
      grantedScopesKnown: true,
      requiredScopes: ["write_inventory_shipments_received_items", "read_inventory_shipments"],
      diagnostics: [{ code: "missing_write_scope" }]
    });
  });

  it("allows inventory transfer receive when received-items and read shipment scopes are known", () => {
    expect(checkWriteScopePreflight(createConfig({
      storeUrl: "demo",
      readOnly: false,
      grantedScopes: ["write_inventory_shipments_received_items", "read_inventory_shipments"]
    }), "inventory.transfer.receive.execute")).toMatchObject({
      ok: true,
      status: "ok",
      requiredScopes: ["write_inventory_shipments_received_items", "read_inventory_shipments"]
    });
  });
});
