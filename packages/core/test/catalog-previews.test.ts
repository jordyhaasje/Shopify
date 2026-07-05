import { describe, expect, it } from "vitest";
import {
  previewCollectionCreate,
  previewInventoryAdjustQuantity,
  previewInventoryMoveQuantity,
  previewInventorySetQuantity,
  previewPageCreate,
  previewProductCreate,
  previewProductImportFromUserUrl,
  previewProductMediaUpdate,
  previewProductUpdate
} from "../src/catalog-previews.js";

describe("catalog and content previews", () => {
  it("creates a product creation preview", () => {
    const preview = previewProductCreate({
      title: "Linen Shirt",
      description: "A light linen shirt.",
      vendor: "Acme",
      productType: "Shirts",
      status: "draft",
      tags: ["linen", "summer"],
      variants: [{ sku: "LINEN-S", price: "29.00" }],
      media: [{ url: "https://example.com/shirt.jpg", alt: "Linen shirt" }],
      seo: { title: "Linen Shirt" }
    });

    expect(preview).toMatchObject({
      ok: true,
      status: "ok",
      target: { type: "product", title: "Linen Shirt" },
      auditContext: {
        tool: "product.create.preview",
        mode: "preview",
        performsShopifyMutation: false,
        usesShopifyWriteOperation: false
      }
    });
    expect(preview.proposedChanges).toEqual(expect.arrayContaining([
      expect.objectContaining({ field: "title", action: "create", value: "Linen Shirt" }),
      expect.objectContaining({ field: "variants", summary: "1 variant supplied" }),
      expect.objectContaining({ field: "media", summary: "1 media reference supplied" })
    ]));
  });

  it("requires a title for product creation previews", () => {
    const preview = previewProductCreate({ vendor: "Acme" });

    expect(preview).toMatchObject({
      ok: false,
      status: "missing_input",
      warnings: [{ code: "missing_input", message: "Provide a product title." }]
    });
  });

  it("creates a product update preview with supplied before values", () => {
    const preview = previewProductUpdate({
      productId: "gid://shopify/Product/1",
      existingProduct: { title: "Old Shirt", status: "DRAFT" },
      changes: { title: "New Shirt", status: "ACTIVE" }
    });

    expect(preview).toMatchObject({
      ok: true,
      status: "ok",
      target: { type: "product", id: "gid://shopify/Product/1" }
    });
    expect(preview.proposedChanges).toEqual(expect.arrayContaining([
      expect.objectContaining({ field: "title", before: "Old Shirt", after: "New Shirt" }),
      expect.objectContaining({ field: "status", before: "DRAFT", after: "ACTIVE" })
    ]));
  });

  it("keeps product update variant option values compact for stored preview execution", () => {
    const preview = previewProductUpdate({
      productId: "gid://shopify/Product/1",
      variants: [{
        optionValues: [{ optionName: "Size", name: "Large" }],
        price: "49.00",
        sku: "LINEN-L",
        inventoryQuantity: 10
      }]
    });
    const variantChange = preview.proposedChanges.find((change) => change.field === "variants");

    expect(variantChange).toMatchObject({
      field: "variants",
      after: {
        count: 1,
        items: [expect.objectContaining({
          fields: expect.objectContaining({
            price: "49.00",
            sku: "LINEN-L",
            optionValues: ["Size=Large"]
          })
        })]
      }
    });
    expect(JSON.stringify(variantChange)).not.toContain("inventoryQuantity");
  });

  it("keeps product update option create values compact for stored preview execution", () => {
    const preview = previewProductUpdate({
      productId: "gid://shopify/Product/1",
      options: [{
        name: "Material",
        values: ["Cotton", "Linen"],
        linkedMetafield: { namespace: "custom", key: "hidden" }
      }]
    });
    const optionChange = preview.proposedChanges.find((change) => change.field === "options");

    expect(optionChange).toMatchObject({
      field: "options",
      after: {
        count: 1,
        items: [expect.objectContaining({
          fields: {
            name: "Material",
            values: ["Cotton", "Linen"]
          }
        })]
      }
    });
    expect(JSON.stringify(optionChange)).not.toContain("linkedMetafield");
  });

  it("keeps product update option IDs compact for stored option rename execution", () => {
    const preview = previewProductUpdate({
      productId: "gid://shopify/Product/1",
      options: [{
        id: "gid://shopify/ProductOption/1",
        name: "Fabric",
        linkedMetafield: { namespace: "custom", key: "hidden" }
      }]
    });
    const optionChange = preview.proposedChanges.find((change) => change.field === "options");

    expect(optionChange).toMatchObject({
      field: "options",
      after: {
        count: 1,
        items: [expect.objectContaining({
          fields: {
            id: "gid://shopify/ProductOption/1",
            name: "Fabric"
          }
        })]
      }
    });
    expect(JSON.stringify(optionChange)).not.toContain("linkedMetafield");
  });

  it("keeps product update option delete IDs compact for stored option delete execution", () => {
    const preview = previewProductUpdate({
      productId: "gid://shopify/Product/1",
      options: [{
        id: "gid://shopify/ProductOption/1",
        delete: true,
        linkedMetafield: { namespace: "custom", key: "hidden" }
      }]
    });
    const optionChange = preview.proposedChanges.find((change) => change.field === "options");

    expect(optionChange).toMatchObject({
      field: "options",
      after: {
        count: 1,
        items: [expect.objectContaining({
          fields: {
            id: "gid://shopify/ProductOption/1",
            deleteOption: true
          }
        })]
      }
    });
    expect(JSON.stringify(optionChange)).not.toContain("linkedMetafield");
  });

  it("keeps product update option order compact for stored option reorder execution", () => {
    const preview = previewProductUpdate({
      productId: "gid://shopify/Product/1",
      optionOrder: [{
        id: "gid://shopify/ProductOption/2",
        values: [{ id: "gid://shopify/ProductOptionValue/2", linkedMetafieldValue: "hidden" }]
      }, {
        id: "gid://shopify/ProductOption/1",
        values: [{ name: "Small" }]
      }]
    });
    const optionChange = preview.proposedChanges.find((change) => change.field === "optionOrder");

    expect(optionChange).toMatchObject({
      field: "optionOrder",
      action: "reorder",
      after: {
        count: 2,
        items: [
          expect.objectContaining({
            fields: {
              id: "gid://shopify/ProductOption/2",
              values: ["gid://shopify/ProductOptionValue/2"]
            }
          }),
          expect.objectContaining({
            fields: {
              id: "gid://shopify/ProductOption/1",
              values: ["Small"]
            }
          })
        ]
      }
    });
    expect(JSON.stringify(optionChange)).not.toContain("linkedMetafieldValue");
  });

  it("previews an explicit inventory quantity set with compare quantity", () => {
    const preview = previewInventorySetQuantity({
      inventoryItemId: "gid://shopify/InventoryItem/1",
      locationId: "gid://shopify/Location/1",
      quantity: 8,
      compareQuantity: 5,
      reason: "correction",
      referenceDocumentUri: "gid://store-agent/TestRun/1"
    });

    expect(preview).toMatchObject({
      ok: true,
      status: "ok",
      target: { type: "inventory", id: "gid://shopify/InventoryItem/1" },
      auditContext: {
        tool: "inventory.setQuantity.preview",
        mode: "preview",
        performsShopifyMutation: false,
        usesShopifyWriteOperation: false
      },
      proposedChanges: expect.arrayContaining([
        expect.objectContaining({ field: "inventoryItemId", value: "gid://shopify/InventoryItem/1" }),
        expect.objectContaining({ field: "locationId", value: "gid://shopify/Location/1" }),
        expect.objectContaining({ field: "quantity", action: "update", before: 5, after: 8 }),
        expect.objectContaining({ field: "reason", value: "correction" })
      ])
    });
  });

  it("requires inventory compare quantity unless explicitly ignored", () => {
    const preview = previewInventorySetQuantity({
      inventoryItemId: "gid://shopify/InventoryItem/1",
      locationId: "gid://shopify/Location/1",
      quantity: 8,
      reason: "correction"
    });

    expect(preview).toMatchObject({
      ok: false,
      status: "missing_input",
      warnings: [{ code: "missing_input", message: "Provide compareQuantity, or explicitly set ignoreCompareQuantity to true." }]
    });
  });

  it("previews an explicit inventory quantity adjustment", () => {
    const preview = previewInventoryAdjustQuantity({
      inventoryItemId: "gid://shopify/InventoryItem/1",
      locationId: "gid://shopify/Location/1",
      delta: -2,
      reason: "correction",
      referenceDocumentUri: "gid://store-agent/TestRun/2"
    });

    expect(preview).toMatchObject({
      ok: true,
      status: "ok",
      target: { type: "inventory", id: "gid://shopify/InventoryItem/1" },
      auditContext: {
        tool: "inventory.adjustQuantity.preview",
        mode: "preview",
        performsShopifyMutation: false,
        usesShopifyWriteOperation: false
      },
      proposedChanges: expect.arrayContaining([
        expect.objectContaining({ field: "inventoryItemId", value: "gid://shopify/InventoryItem/1" }),
        expect.objectContaining({ field: "locationId", value: "gid://shopify/Location/1" }),
        expect.objectContaining({ field: "delta", action: "update", before: "current available quantity", after: -2 }),
        expect.objectContaining({ field: "reason", value: "correction" })
      ])
    });
  });

  it("requires a non-zero inventory adjustment delta", () => {
    const preview = previewInventoryAdjustQuantity({
      inventoryItemId: "gid://shopify/InventoryItem/1",
      locationId: "gid://shopify/Location/1",
      delta: 0,
      reason: "correction"
    });

    expect(preview).toMatchObject({
      ok: false,
      status: "validation_error",
      warnings: [{ code: "validation_error", message: "Inventory adjustment delta must be a non-zero integer." }]
    });
  });

  it("previews an explicit inventory quantity state move", () => {
    const preview = previewInventoryMoveQuantity({
      inventoryItemId: "gid://shopify/InventoryItem/1",
      locationId: "gid://shopify/Location/1",
      quantity: 3,
      fromName: "available",
      toName: "reserved",
      reason: "reservation",
      referenceDocumentUri: "gid://store-agent/TestRun/3"
    });

    expect(preview).toMatchObject({
      ok: true,
      status: "ok",
      target: { type: "inventory", id: "gid://shopify/InventoryItem/1" },
      auditContext: {
        tool: "inventory.moveQuantity.preview",
        mode: "preview",
        performsShopifyMutation: false,
        usesShopifyWriteOperation: false
      },
      proposedChanges: expect.arrayContaining([
        expect.objectContaining({ field: "inventoryItemId", value: "gid://shopify/InventoryItem/1" }),
        expect.objectContaining({ field: "locationId", value: "gid://shopify/Location/1" }),
        expect.objectContaining({ field: "quantity", action: "update", before: "available", after: 3 }),
        expect.objectContaining({ field: "fromName", value: "available" }),
        expect.objectContaining({ field: "toName", value: "reserved" })
      ])
    });
  });

  it("requires positive quantity and distinct states for inventory move previews", () => {
    const zero = previewInventoryMoveQuantity({
      inventoryItemId: "gid://shopify/InventoryItem/1",
      locationId: "gid://shopify/Location/1",
      quantity: 0,
      fromName: "available",
      toName: "reserved",
      reason: "reservation"
    });
    const sameState = previewInventoryMoveQuantity({
      inventoryItemId: "gid://shopify/InventoryItem/1",
      locationId: "gid://shopify/Location/1",
      quantity: 3,
      fromName: "available",
      toName: "available",
      reason: "reservation"
    });

    expect(zero).toMatchObject({
      ok: false,
      status: "validation_error",
      warnings: [{ code: "validation_error", message: "Inventory move quantity must be a positive integer." }]
    });
    expect(sameState).toMatchObject({
      ok: false,
      status: "validation_error",
      warnings: [{ code: "validation_error", message: "Source and destination inventory quantity names must differ." }]
    });
  });

  it("keeps product update option value IDs compact for stored option value rename execution", () => {
    const preview = previewProductUpdate({
      productId: "gid://shopify/Product/1",
      options: [{
        id: "gid://shopify/ProductOption/1",
        optionValues: [{
          id: "gid://shopify/ProductOptionValue/1",
          name: "Purple",
          linkedMetafieldValue: "hidden"
        }]
      }]
    });
    const optionChange = preview.proposedChanges.find((change) => change.field === "options");

    expect(optionChange).toMatchObject({
      field: "options",
      after: {
        count: 1,
        items: [expect.objectContaining({
          fields: {
            id: "gid://shopify/ProductOption/1",
            values: ["gid://shopify/ProductOptionValue/1=Purple"]
          }
        })]
      }
    });
    expect(JSON.stringify(optionChange)).not.toContain("linkedMetafieldValue");
  });

  it("keeps product update option value names compact for stored option value add execution", () => {
    const preview = previewProductUpdate({
      productId: "gid://shopify/Product/1",
      options: [{
        id: "gid://shopify/ProductOption/1",
        optionValues: [{
          name: "Yellow",
          linkedMetafieldValue: "hidden"
        }, {
          value: "Red"
        }, {
          name: "Tone=Warm"
        }]
      }]
    });
    const optionChange = preview.proposedChanges.find((change) => change.field === "options");

    expect(optionChange).toMatchObject({
      field: "options",
      after: {
        count: 1,
        items: [expect.objectContaining({
          fields: {
            id: "gid://shopify/ProductOption/1",
            values: ["Yellow", "Red", "Tone=Warm"]
          }
        })]
      }
    });
    expect(JSON.stringify(optionChange)).not.toContain("linkedMetafieldValue");
  });

  it("keeps product update option value delete IDs compact for stored option value delete execution", () => {
    const preview = previewProductUpdate({
      productId: "gid://shopify/Product/1",
      options: [{
        id: "gid://shopify/ProductOption/1",
        deleteValueIds: [{
          id: "gid://shopify/ProductOptionValue/1",
          linkedMetafieldValue: "hidden"
        }, "gid://shopify/ProductOptionValue/2"]
      }]
    });
    const optionChange = preview.proposedChanges.find((change) => change.field === "options");

    expect(optionChange).toMatchObject({
      field: "options",
      after: {
        count: 1,
        items: [expect.objectContaining({
          fields: {
            id: "gid://shopify/ProductOption/1",
            deleteValueIds: ["gid://shopify/ProductOptionValue/1", "gid://shopify/ProductOptionValue/2"]
          }
        })]
      }
    });
    expect(JSON.stringify(optionChange)).not.toContain("linkedMetafieldValue");
  });

  it("requires an explicit product target for update previews", () => {
    const preview = previewProductUpdate({ changes: { title: "New Shirt" } });

    expect(preview).toMatchObject({
      ok: false,
      status: "missing_input",
      warnings: [{ code: "missing_input" }]
    });
  });

  it("creates a product media update preview", () => {
    const preview = previewProductMediaUpdate({
      handle: "linen-shirt",
      media: [{ url: "https://example.com/new.jpg", alt: "New front view" }],
      updates: [{ mediaId: "gid://shopify/MediaImage/1", alt: "Updated alt" }],
      deleteMediaIds: ["gid://shopify/MediaImage/2"],
      order: ["gid://shopify/MediaImage/1", "new-1"]
    });

    expect(preview).toMatchObject({
      ok: true,
      status: "ok",
      target: { type: "product_media", handle: "linen-shirt" }
    });
    expect(preview.proposedChanges.map((change) => change.action)).toEqual(["add", "update", "delete", "reorder"]);
  });

  it("creates a product import-from-user-url plan", () => {
    const preview = previewProductImportFromUserUrl({
      url: "https://example.com/products/linen-shirt",
      instructions: "Rewrite the title and description in an original voice; use visible color names only."
    });

    expect(preview).toMatchObject({
      ok: true,
      status: "ok",
      target: { type: "product_url_import", url: "https://example.com/products/linen-shirt" }
    });
    expect(JSON.stringify(preview)).toContain("not accessed");
    expect(preview.warnings).toEqual(expect.arrayContaining([expect.objectContaining({ code: "no_fetch_performed" })]));
  });

  it("requires a URL for product import previews", () => {
    const preview = previewProductImportFromUserUrl({ instructions: "Rewrite only." });

    expect(preview).toMatchObject({
      ok: false,
      status: "missing_input",
      warnings: [{ code: "missing_input" }]
    });
  });

  it("creates a page creation preview", () => {
    const preview = previewPageCreate({
      title: "Care Guide",
      body: "Wash cold and hang dry.",
      handle: "care-guide",
      seo: { title: "Care Guide" },
      publishPreference: "draft"
    });

    expect(preview).toMatchObject({
      ok: true,
      status: "ok",
      target: { type: "page", title: "Care Guide", handle: "care-guide" }
    });
    expect(preview.proposedChanges).toEqual(expect.arrayContaining([
      expect.objectContaining({ field: "body", action: "create" })
    ]));
  });

  it("creates a collection creation preview", () => {
    const preview = previewCollectionCreate({
      title: "Summer Linen",
      productIds: ["gid://shopify/Product/1", "gid://shopify/Product/2"],
      publishPreference: "draft"
    });

    expect(preview).toMatchObject({
      ok: true,
      status: "ok",
      target: { type: "collection", title: "Summer Linen" }
    });
    expect(preview.proposedChanges).toEqual(expect.arrayContaining([
      expect.objectContaining({ field: "productIds", summary: "2 explicit product IDs supplied" })
    ]));
  });

  it("requires explicit product IDs or rules for collection previews", () => {
    const preview = previewCollectionCreate({ title: "Summer Linen" });

    expect(preview).toMatchObject({
      ok: false,
      status: "missing_input",
      warnings: [{ code: "missing_input" }]
    });
  });

  it("redacts secrets and summarizes oversized content", () => {
    const preview = previewProductCreate({
      title: "Secret Test",
      description: `Lead copy ${"x".repeat(1000)} shpat_test_secret`,
      metafields: [{ namespace: "custom", key: "token", value: "shpat_test_secret" }]
    });
    const output = JSON.stringify(preview);

    expect(output).not.toContain("shpat_test_secret");
    expect(output.length).toBeLessThan(3000);
    expect(output).toContain("[redacted]");
  });

  it("redacts secret-looking query values from import URL targets", () => {
    const preview = previewProductImportFromUserUrl({
      url: "https://user:pass@example.com/products/linen-shirt?access_token=shpat_url_secret&color=blue&ref=shpua_ref_secret&key=plain-secret",
      instructions: "Rewrite only from visible rendered page signals."
    });
    const output = JSON.stringify(preview);

    expect(preview).toMatchObject({ ok: true, status: "ok" });
    expect(output).not.toContain("shpat_url_secret");
    expect(output).not.toContain("shpua_ref_secret");
    expect(output).not.toContain("plain-secret");
    expect(output).not.toContain("user:pass");
    expect(preview.auditContext.target).not.toContain("shpat_url_secret");
    expect(preview.auditContext.target).not.toContain("shpua_ref_secret");
  });

  it("caps oversized product title, vendor, and tag strings", () => {
    const oversizedTitle = `Linen Shirt ${"title".repeat(120)}`;
    const oversizedVendor = `Vendor ${"vendor".repeat(120)}`;
    const oversizedTag = `tag-${"long".repeat(120)}`;
    const preview = previewProductCreate({
      title: oversizedTitle,
      vendor: oversizedVendor,
      tags: [oversizedTag],
      description: "A short description."
    });
    const output = JSON.stringify(preview);

    expect(preview).toMatchObject({ ok: true, status: "ok" });
    expect(output).not.toContain(oversizedTitle);
    expect(output).not.toContain(oversizedVendor);
    expect(output).not.toContain(oversizedTag);
    expect(output.length).toBeLessThan(2500);
  });

  it("redacts secret-looking comma-separated tags", () => {
    const preview = previewProductCreate({
      title: "Comma Tags",
      description: "A short description.",
      tags: "safe-tag, shpat_tag_secret, another-tag"
    });
    const output = JSON.stringify(preview);

    expect(output).not.toContain("shpat_tag_secret");
    expect(output).toContain("[redacted]");
  });

  it("sanitizes page target title and handle", () => {
    const preview = previewPageCreate({
      title: "Care Guide shpat_page_secret",
      handle: "care-guide-shpua_handle_secret",
      body: "Wash cold."
    });
    const output = JSON.stringify(preview);

    expect(preview).toMatchObject({
      ok: true,
      status: "ok",
      target: { type: "page", title: "[redacted]", handle: "[redacted]" }
    });
    expect(output).not.toContain("shpat_page_secret");
    expect(output).not.toContain("shpua_handle_secret");
    expect(preview.auditContext.target).toBe("[redacted]");
  });
});
