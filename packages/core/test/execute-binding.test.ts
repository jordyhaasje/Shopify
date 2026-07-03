import { describe, expect, it } from "vitest";
import { validateExecutePreviewBinding } from "../src/execute-binding.js";

describe("execute preview binding", () => {
  it("blocks missing preview binding inputs", () => {
    const result = validateExecutePreviewBinding({}, {
      executeTool: "product.create.execute",
      expectedPreviewTool: "product.create.preview",
      target: "product"
    });

    expect(result).toMatchObject({
      ok: false,
      diagnostics: [
        { code: "missing_preview_id" },
        { code: "missing_confirmation" },
        { code: "missing_reviewed_payload" },
        { code: "missing_expected_tool" },
        { code: "missing_target" },
        { code: "missing_preview_hash" },
        { code: "missing_reviewed_changes_hash" }
      ]
    });
  });

  it("blocks missing expected tool", () => {
    const result = validateExecutePreviewBinding({
      previewId: "preview_123",
      confirmed: true,
      reviewedPayload: { reviewed: true },
      target: "product",
      previewHash: "hash-a",
      reviewedChangesHash: "hash-a"
    }, {
      executeTool: "product.create.execute",
      expectedPreviewTool: "product.create.preview",
      target: "product"
    });

    expect(result).toMatchObject({
      ok: false,
      diagnostics: [{ code: "missing_expected_tool" }]
    });
  });

  it("blocks missing target", () => {
    const result = validateExecutePreviewBinding({
      previewId: "preview_123",
      confirmed: true,
      reviewedPayload: { reviewed: true },
      expectedTool: "product.create.preview",
      previewHash: "hash-a",
      reviewedChangesHash: "hash-a"
    }, {
      executeTool: "product.create.execute",
      expectedPreviewTool: "product.create.preview",
      target: "product"
    });

    expect(result).toMatchObject({
      ok: false,
      diagnostics: [{ code: "missing_target" }]
    });
  });

  it("blocks missing preview hash", () => {
    const result = validateExecutePreviewBinding({
      previewId: "preview_123",
      confirmed: true,
      reviewedPayload: { reviewed: true },
      expectedTool: "product.create.preview",
      target: "product",
      reviewedChangesHash: "hash-a"
    }, {
      executeTool: "product.create.execute",
      expectedPreviewTool: "product.create.preview",
      target: "product"
    });

    expect(result).toMatchObject({
      ok: false,
      diagnostics: [{ code: "missing_preview_hash" }]
    });
  });

  it("blocks missing reviewed changes hash", () => {
    const result = validateExecutePreviewBinding({
      previewId: "preview_123",
      confirmed: true,
      reviewedPayload: { reviewed: true },
      expectedTool: "product.create.preview",
      target: "product",
      previewHash: "hash-a"
    }, {
      executeTool: "product.create.execute",
      expectedPreviewTool: "product.create.preview",
      target: "product"
    });

    expect(result).toMatchObject({
      ok: false,
      diagnostics: [{ code: "missing_reviewed_changes_hash" }]
    });
  });

  it("blocks mismatched preview tool, target, and hash", () => {
    const result = validateExecutePreviewBinding({
      previewId: "preview_123",
      confirmed: true,
      reviewedPayload: { reviewed: true },
      expectedTool: "product.create.preview",
      target: "wrong-target",
      previewHash: "hash-a",
      reviewedChangesHash: "hash-b"
    }, {
      executeTool: "product.update.execute",
      expectedPreviewTool: "product.update.preview",
      target: "gid://shopify/Product/1"
    });

    expect(result.ok).toBe(false);
    expect(result.diagnostics.map((diagnostic) => diagnostic.code)).toEqual([
      "preview_tool_mismatch",
      "target_mismatch",
      "preview_hash_mismatch"
    ]);
  });

  it("blocks different secret-looking hashes instead of comparing redacted values", () => {
    const result = validateExecutePreviewBinding({
      previewId: "preview_123",
      confirmed: true,
      reviewedPayload: { reviewed: true },
      expectedTool: "product.update.preview",
      target: "gid://shopify/Product/1",
      previewHash: "shpat_hash_a",
      reviewedChangesHash: "shpat_hash_b"
    }, {
      executeTool: "product.update.execute",
      expectedPreviewTool: "product.update.preview",
      target: "gid://shopify/Product/1"
    });
    const output = JSON.stringify(result);

    expect(result.ok).toBe(false);
    expect(result.diagnostics.map((diagnostic) => diagnostic.code)).toEqual([
      "invalid_secret_like_hash",
      "invalid_secret_like_hash",
      "preview_hash_mismatch"
    ]);
    expect(output).not.toContain("shpat_hash_a");
    expect(output).not.toContain("shpat_hash_b");
  });

  it("blocks different secret-looking targets instead of comparing redacted values", () => {
    const result = validateExecutePreviewBinding({
      previewId: "preview_123",
      confirmed: true,
      reviewedPayload: { reviewed: true },
      expectedTool: "product.update.preview",
      target: "target_shpat_secret_a",
      previewHash: "hash-a",
      reviewedChangesHash: "hash-a"
    }, {
      executeTool: "product.update.execute",
      expectedPreviewTool: "product.update.preview",
      target: "target_shpat_secret_b"
    });
    const output = JSON.stringify(result);

    expect(result).toMatchObject({
      ok: false,
      diagnostics: [{ code: "target_mismatch" }]
    });
    expect(output).not.toContain("target_shpat_secret_a");
    expect(output).not.toContain("target_shpat_secret_b");
  });

  it("blocks secret-looking preview IDs", () => {
    const result = validateExecutePreviewBinding({
      previewId: "preview_shpat_binding_secret",
      confirmed: true,
      reviewedPayload: { reviewed: true },
      expectedTool: "product.create.preview",
      target: "product",
      previewHash: "hash-a",
      reviewedChangesHash: "hash-a"
    }, {
      executeTool: "product.create.execute",
      expectedPreviewTool: "product.create.preview",
      target: "product"
    });
    const output = JSON.stringify(result);

    expect(result).toMatchObject({
      ok: false,
      previewId: "[redacted]",
      diagnostics: [{ code: "invalid_secret_like_preview_id" }]
    });
    expect(output).not.toContain("shpat_binding_secret");
  });

  it("accepts complete preview binding input", () => {
    const result = validateExecutePreviewBinding({
      previewId: "preview_123",
      confirmed: true,
      reviewedPayload: { reviewed: true },
      expectedTool: "product.update.preview",
      target: "gid://shopify/Product/1",
      previewHash: "hash-a",
      reviewedChangesHash: "hash-a"
    }, {
      executeTool: "product.update.execute",
      expectedPreviewTool: "product.update.preview",
      target: "gid://shopify/Product/1"
    });

    expect(result).toMatchObject({
      ok: true,
      previewId: "preview_123",
      diagnostics: []
    });
  });

  it("redacts secret-looking returned target values", () => {
    const result = validateExecutePreviewBinding({
      previewId: "preview_123",
      confirmed: true,
      reviewedPayload: { reviewed: true },
      expectedTool: "product.create.preview",
      target: "target_shpua_binding_secret",
      previewHash: "hash-a",
      reviewedChangesHash: "hash-a"
    }, {
      executeTool: "product.create.execute",
      expectedPreviewTool: "product.create.preview",
      target: "target_shpua_binding_secret"
    });

    expect(JSON.stringify(result)).not.toContain("shpat_binding_secret");
    expect(JSON.stringify(result)).not.toContain("shpua_binding_secret");
    expect(result).toMatchObject({
      ok: true,
      previewId: "preview_123",
      target: "[redacted]"
    });
  });
});
