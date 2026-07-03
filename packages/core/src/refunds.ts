import { createHash, randomUUID } from "node:crypto";

export interface RefundPreviewInput {
  orderId: string;
  lineItems?: Array<{ lineItemId: string; quantity: number; amount: string }>;
  shippingAmount?: string;
  reason?: string;
}

export interface RefundPreview {
  orderId: string;
  kind: "full" | "partial";
  summary: string;
  idempotencyKey: string;
}

export function createRefundPreview(input: RefundPreviewInput): RefundPreview {
  const hasPartialItems = Boolean(input.lineItems?.length || input.shippingAmount);
  const basis = JSON.stringify({
    orderId: input.orderId,
    lineItems: input.lineItems ?? [],
    shippingAmount: input.shippingAmount ?? null,
    reason: input.reason ?? null
  });
  const hash = createHash("sha256").update(basis).digest("hex").slice(0, 24);
  return {
    orderId: input.orderId,
    kind: hasPartialItems ? "partial" : "full",
    summary: hasPartialItems ? "Partial refund preview generated." : "Full refund preview generated.",
    idempotencyKey: `refund_${hash}_${randomUUID().slice(0, 8)}`
  };
}
