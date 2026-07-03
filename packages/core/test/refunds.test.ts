import { describe, expect, it } from "vitest";
import { createRefundPreview } from "../src/refunds.js";

describe("refund previews", () => {
  it("marks partial refunds and creates an idempotency key", () => {
    const preview = createRefundPreview({
      orderId: "gid://shopify/Order/1",
      shippingAmount: "4.95"
    });

    expect(preview.kind).toBe("partial");
    expect(preview.idempotencyKey).toMatch(/^refund_/);
  });
});
