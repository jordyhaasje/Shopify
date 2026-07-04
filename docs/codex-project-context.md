# Codex Project Context

Shopify Store Agent is a local-first Shopify MCP server, CLI wizard, and bootstrap skill package for AI coding/workflow hosts. It is not a Shopify App Store app, embedded Admin app, SaaS dashboard, or email MCP server.

Durable project constraints:

- Keep PRs small and focused, one meaningful change at a time.
- Default to read-only mode.
- Do not add `.github/workflows`.
- Do not commit, log, document, or test with real secrets or real customer/order data.
- Tests must use mocked fetch only; do not add automated live Shopify tests.
- `pnpm run smoke:local` must stay local/no-write and report `fetchCalls: 0`.
- Execute paths must require stored preview binding, reviewed payload hashing, matching target/tool/hash values, and explicit confirmation.
- Do not trust loose execute input when a stored preview exists.
- Current real write tools are `page.create.execute` and `product.create.execute`.
- All other execute tools remain fail-closed placeholders unless a future task explicitly implements one.
- Do not return raw Shopify response nodes, raw reviewed payloads, or large customer/order/product dumps.
- Users must provide explicit products, URLs, CSV files, images, customer emails, order numbers, Shopify IDs, handles, or tracking refs. Do not add autonomous product search.
