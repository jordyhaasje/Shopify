import { describe, expect, it } from "vitest";
import {
  previewCollectionCreate,
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
});
