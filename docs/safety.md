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

The MCP default context persists audit entries to a local append-only JSONL file. By default the file is `audit.jsonl` beside the configured local config file, or `~/.shopify-store-agent/audit.jsonl` when no config path is set. `SHOPIFY_STORE_AGENT_AUDIT_LOG` or config `auditLogPath` can point it elsewhere.

Audit entries must stay compact and safe. They must not include secrets, raw Shopify response nodes, raw reviewed payloads, full customer/order data, or large dumps.
