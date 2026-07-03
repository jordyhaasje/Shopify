# Safety Model

The product is local-first and preview-first.

## Rules

- Start in read-only mode by default.
- Any risky write must support preview or dry-run.
- Execute actions require explicit confirmation.
- Refund execution requires an idempotency key from the preview step.
- Bulk edits must show a diff before execution.
- Theme changes must create a preview before live apply.
- The agent must not search the internet for products to add. Users provide product data, product URLs, CSV files, images, or explicit Shopify IDs.
- External Shopify reference URLs can be used for visual inspiration and rendered HTML analysis, not for claiming access to private Liquid source.

## Audit

Every tool call should record:

- timestamp
- tool name
- target
- mode: read, preview, or execute
- summary
- result

The v1 implementation includes an in-memory audit log and reserves config for a local file-backed audit log.
