import { describe, expect, it } from "vitest";
import { createBulkPreview } from "../src/bulk.js";

describe("bulk previews", () => {
  it("summarizes explicit changes", () => {
    const preview = createBulkPreview([
      { id: "p1", before: { price: "10.00" }, after: { price: "12.00" } }
    ]);

    expect(preview.count).toBe(1);
    expect(preview.includedChanges).toBe(1);
    expect(preview.summary).toBe("1 change ready for review.");
    expect(preview.changes[0]).toMatchObject({
      id: "p1",
      before: {
        type: "object",
        fields: {
          price: { type: "string", length: 5 }
        }
      },
      after: {
        type: "object",
        fields: {
          price: { type: "string", length: 5 }
        }
      },
      changedKeys: ["price"]
    });
  });

  it("does not echo raw secret-like values or secret fields", () => {
    const preview = createBulkPreview([
      {
        id: "shpat_row_secret",
        before: { title: "Old", adminAccessToken: "shpat_before_secret" },
        after: { title: "New", client_secret: "shpss_after_secret" }
      }
    ]);
    const output = JSON.stringify(preview);

    expect(preview.changes[0].id).toBe("change-1");
    expect(output).not.toContain("shpat_row_secret");
    expect(output).not.toContain("shpat_before_secret");
    expect(output).not.toContain("shpss_after_secret");
    expect(output).not.toContain("adminAccessToken");
    expect(output).not.toContain("client_secret");
    expect(output).toContain("[redacted]");
  });

  it("limits large bulk preview output", () => {
    const changes = Array.from({ length: 51 }, (_, index) => ({
      id: `row-${index + 1}`,
      before: { price: index },
      after: { price: index + 1 }
    }));

    const preview = createBulkPreview(changes);

    expect(preview.count).toBe(51);
    expect(preview.includedChanges).toBe(50);
    expect(preview.changes).toHaveLength(50);
    expect(preview.warnings).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "changes_truncated" })
    ]));
  });
});
