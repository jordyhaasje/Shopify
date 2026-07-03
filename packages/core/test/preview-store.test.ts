import { describe, expect, it } from "vitest";
import {
  MemoryPreviewStore,
  hashPreviewContent,
  previewRecordBindingTarget,
  verifyStoredPreviewBinding
} from "../src/preview-store.js";

describe("preview store", () => {
  it("saves and retrieves preview records", () => {
    const store = new MemoryPreviewStore({ now: () => new Date("2026-07-03T10:00:00.000Z") });
    const record = store.savePreview(productPreview());
    const lookup = store.getPreview(record.previewId);

    expect(record).toMatchObject({
      previewId: expect.stringMatching(/^preview_/),
      tool: "product.create.preview",
      status: "active",
      createdAt: "2026-07-03T10:00:00.000Z",
      previewHash: expect.stringMatching(/^sha256:/)
    });
    expect(lookup).toMatchObject({
      ok: true,
      status: "active",
      record: { previewId: record.previewId, previewHash: record.previewHash }
    });
  });

  it("keeps provided preview IDs stable and generated preview IDs unique by content", () => {
    const store = new MemoryPreviewStore();
    const provided = store.savePreview({ ...productPreview(), previewId: "preview_supplied" });
    const first = store.savePreview(productPreview({ target: { type: "product", title: "A" } }));
    const second = store.savePreview(productPreview({ target: { type: "product", title: "B" } }));

    expect(provided.previewId).toBe("preview_supplied");
    expect(first.previewId).not.toBe(second.previewId);
  });

  it("hashes deterministic safe content independent of object key order", () => {
    const first = hashPreviewContent({ tool: "product.create.preview", target: { title: "A", id: "1" }, proposedChanges: [{ field: "title", value: "A" }] });
    const second = hashPreviewContent({ proposedChanges: [{ value: "A", field: "title" }], target: { id: "1", title: "A" }, tool: "product.create.preview" });

    expect(first).toBe(second);
  });

  it("changes hash when tool, target, or proposed changes change", () => {
    const base = hashPreviewContent({ tool: "product.create.preview", target: "A", proposedChanges: [{ field: "title", value: "A" }] });

    expect(hashPreviewContent({ tool: "product.update.preview", target: "A", proposedChanges: [{ field: "title", value: "A" }] })).not.toBe(base);
    expect(hashPreviewContent({ tool: "product.create.preview", target: "B", proposedChanges: [{ field: "title", value: "A" }] })).not.toBe(base);
    expect(hashPreviewContent({ tool: "product.create.preview", target: "A", proposedChanges: [{ field: "title", value: "B" }] })).not.toBe(base);
  });

  it("redacts secret-looking values and bounds large payloads in safe output", () => {
    const store = new MemoryPreviewStore();
    const record = store.savePreview(productPreview({
      target: { type: "product", title: `Secret ${"x".repeat(1000)} shpat_preview_secret` },
      proposedChanges: [{ field: "title", value: `Long ${"y".repeat(1000)}` }, { field: "token", value: "shpua_store_secret" }]
    }));
    const output = JSON.stringify(record);

    expect(output).not.toContain("shpat_preview_secret");
    expect(output).not.toContain("shpua_store_secret");
    expect(output).not.toContain("x".repeat(500));
    expect(output).not.toContain("y".repeat(500));
    expect(output.length).toBeLessThan(2500);
  });

  it("treats expired previews as invalid for binding", () => {
    let now = new Date("2026-07-03T10:00:00.000Z");
    const store = new MemoryPreviewStore({ ttlMs: 1000, now: () => now });
    const record = store.savePreview(productPreview());

    now = new Date("2026-07-03T10:00:02.000Z");
    const lookup = store.getPreview(record.previewId);

    expect(lookup).toMatchObject({
      ok: false,
      status: "expired",
      diagnostic: { code: "stored_preview_expired" }
    });
  });

  it("fails closed for missing stored preview lookup", () => {
    const store = new MemoryPreviewStore();
    const result = verifyStoredPreviewBinding(store, {
      previewId: "preview_missing",
      confirmed: true,
      reviewedPayload: { reviewed: true },
      expectedTool: "product.create.preview",
      target: "Linen Shirt",
      previewHash: "sha256:missing",
      reviewedChangesHash: "sha256:missing"
    }, {
      executeTool: "product.create.execute",
      expectedPreviewTool: "product.create.preview",
      target: "Linen Shirt"
    });

    expect(result).toMatchObject({
      ok: false,
      diagnostics: expect.arrayContaining([expect.objectContaining({ code: "stored_preview_missing" })])
    });
  });

  it("marks reviewed payloads with a hash without returning raw payload", () => {
    const store = new MemoryPreviewStore();
    const record = store.savePreview(productPreview());
    const review = store.markReviewed(record.previewId, { title: "Reviewed", token: "shpat_review_secret" });
    const output = JSON.stringify(review);

    expect(review).toMatchObject({
      ok: true,
      reviewedChangesHash: expect.stringMatching(/^sha256:/)
    });
    expect(output).not.toContain("shpat_review_secret");
    expect(output).not.toContain("Reviewed");
  });

  it("verifies matching stored preview binding and still only authorizes placeholder flow", () => {
    const store = new MemoryPreviewStore();
    const record = store.savePreview(productPreview());
    const target = previewRecordBindingTarget(record);
    const result = verifyStoredPreviewBinding(store, {
      previewId: record.previewId,
      confirmed: true,
      reviewedPayload: { reviewed: true },
      expectedTool: "product.create.preview",
      target,
      previewHash: record.previewHash,
      reviewedChangesHash: record.previewHash
    }, {
      executeTool: "product.create.execute",
      expectedPreviewTool: "product.create.preview",
      target
    });

    expect(result).toMatchObject({
      ok: true,
      diagnostics: []
    });
  });

  it("blocks expired and mismatched stored preview bindings", () => {
    const store = new MemoryPreviewStore();
    const record = store.savePreview(productPreview());
    store.expirePreview(record.previewId);

    const expired = verifyStoredPreviewBinding(store, {
      previewId: record.previewId,
      confirmed: true,
      reviewedPayload: { reviewed: true },
      expectedTool: "product.create.preview",
      target: "Linen Shirt",
      previewHash: record.previewHash,
      reviewedChangesHash: record.previewHash
    }, {
      executeTool: "product.create.execute",
      expectedPreviewTool: "product.create.preview",
      target: "Linen Shirt"
    });

    const active = new MemoryPreviewStore();
    const activeRecord = active.savePreview(productPreview());
    const mismatched = verifyStoredPreviewBinding(active, {
      previewId: activeRecord.previewId,
      confirmed: true,
      reviewedPayload: { reviewed: true },
      expectedTool: "product.create.preview",
      target: "Different Shirt",
      previewHash: "sha256:different",
      reviewedChangesHash: "sha256:different"
    }, {
      executeTool: "product.create.execute",
      expectedPreviewTool: "product.create.preview",
      target: "Different Shirt"
    });

    expect(expired).toMatchObject({
      ok: false,
      diagnostics: expect.arrayContaining([expect.objectContaining({ code: "stored_preview_expired" })])
    });
    expect(mismatched).toMatchObject({
      ok: false,
      diagnostics: expect.arrayContaining([
        expect.objectContaining({ code: "stored_preview_target_mismatch" }),
        expect.objectContaining({ code: "stored_preview_hash_mismatch" })
      ])
    });
  });
});

function productPreview(overrides: Partial<Parameters<MemoryPreviewStore["savePreview"]>[0]> = {}): Parameters<MemoryPreviewStore["savePreview"]>[0] {
  return {
    tool: "product.create.preview",
    target: { type: "product", title: "Linen Shirt" },
    summary: "Preview product creation.",
    proposedChanges: [{ field: "title", action: "create", value: "Linen Shirt" }],
    requiredConfirmationForExecute: "Review preview before execute.",
    auditContext: {
      tool: "product.create.preview",
      mode: "preview",
      target: "Linen Shirt",
      requiresExecuteConfirmation: true,
      performsShopifyMutation: false,
      usesShopifyWriteOperation: false
    },
    ...overrides
  };
}
