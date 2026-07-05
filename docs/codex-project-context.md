# Codex Project Context

Shopify Store Agent is a local-first Shopify MCP server, CLI wizard, and bootstrap skill package for AI coding/workflow hosts. It is not a Shopify App Store app, embedded Admin app, SaaS dashboard, or email MCP server.

Durable project constraints:

- Keep PRs small and focused, one meaningful change at a time.
- Keep [user-quickstart.md](user-quickstart.md) as the compact first-run user guide; deeper docs should link to it instead of duplicating the full flow.
- Keep [product-goal-and-roadmap.md](product-goal-and-roadmap.md) as the canonical product goal, MVP status, implementation roadmap, and Codex operating-rules document.
- Default to read-only mode.
- Do not add `.github/workflows`.
- Do not commit, log, document, or test with real secrets or real customer/order data.
- Tests must use mocked fetch only; do not add automated live Shopify tests.
- `pnpm run smoke:local` must stay local/no-write and report `fetchCalls: 0`.
- Current install docs and MCP snippets should assume GitHub clone + `pnpm install` + `pnpm run build`; npm/npx is future until package publishing is active.
- Future package publishing is manual, requires explicit approval, and should follow [release-runbook.md](release-runbook.md).
- Generated MCP snippets should use `node /absolute/path/to/Shopify/packages/mcp/dist/server.js` for the GitHub-local route and must use `SHOPIFY_STORE_AGENT_CONFIG` without secrets.
- Local OAuth is the recommended auth route when Shopify app client credentials exist. `auth` runs the browser flow and stores the token locally; `setup --auth oauth` only provides guidance/snippets. Manual Admin API token setup remains a fallback.
- Execute paths must require stored preview binding, reviewed payload hashing, matching target/tool/hash values, and explicit confirmation.
- MCP runtime audit entries persist locally to append-only JSONL and must remain compact/safe.
- Do not trust loose execute input when a stored preview exists.
- Current real read tools include `shopify.capabilities.check`, `order.find`, `order.get`, `customer.find`, `tracking.get`, `product.get`, read-only `inventory.lookup` for explicit inventory item ID, variant ID, or SKU inputs, and read-only `inventory.locationLookup` for explicit location ID, name, or query inputs.
- Current real write tools are `page.create.execute`, `product.create.execute`, minimal basic-field, explicit-variant-price, explicit-variant-create, explicit-option-create, explicit-option-delete, explicit-option-reorder, explicit-option-rename, explicit-option-value-rename, explicit-option-value-add, or explicit-option-value-delete `product.update.execute`, custom explicit-product `collection.create.execute`, explicit single-item `inventory.setQuantity.execute`, explicit single-item `inventory.adjustQuantity.execute`, explicit single-item same-location state `inventory.moveQuantity.execute`, explicit single-item draft transfer `inventory.transfer.execute`, explicit transfer mark-ready `inventory.transfer.markReady.execute`, and explicit transfer cancel `inventory.transfer.cancel.execute`.
- All other execute tools remain fail-closed placeholders unless a future task explicitly implements one.
- Do not return raw Shopify response nodes, raw reviewed payloads, or large customer/order/product dumps.
- Users must provide explicit products, URLs, CSV files, images, customer emails, order numbers, Shopify IDs, handles, or tracking refs. Do not add autonomous product search.
- Users may phrase requests in ordinary store language. The AI host should translate the request, ask for missing exact targets, and never guess which product, order, customer, or other store object was intended.
