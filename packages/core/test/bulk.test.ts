import { describe, expect, it } from "vitest";
import { createBulkPreview } from "../src/bulk.js";

describe("bulk previews", () => {
  it("summarizes explicit changes", () => {
    const preview = createBulkPreview([
      { id: "p1", before: { price: "10.00" }, after: { price: "12.00" } }
    ]);

    expect(preview.count).toBe(1);
    expect(preview.summary).toBe("1 change ready for review.");
  });
});
