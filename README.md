# Shopify Store Agent

Shopify Store Agent is a local-first MCP server, CLI wizard, and bootstrap skill package for AI hosts such as Codex, Claude Code, Cursor, and other MCP-compatible tools.

It helps an AI host work with Shopify store data and store-management workflows. Existing email MCP servers can be connected separately in the same host so the model can combine customer emails with Shopify order/customer context.

## What It Is Not

Shopify Store Agent is not a Shopify App Store app, not an embedded Shopify Admin app, and not a merchant-facing Shopify application.

Shopify OAuth, when used, is only a local install/auth mechanism for the MCP/CLI package. Manual Admin API token setup remains supported.

## Current Status

The foundation is in place: auth, config storage, documentation, MCP SDK startup, safety helpers, Admin GraphQL client, and capability diagnostics.

Real read-only Shopify MCP tools are implemented for `shopify.capabilities.check`, `order.find`, `order.get`, `customer.find`, `tracking.get`, and `product.get`.

Write tools are still guarded fail-closed placeholders, including product create/update execute, customer address update execute, refund execute, tracking update execute, page/collection execute, bulk execute, and theme apply. No Shopify mutations are implemented yet.

## Temporary GitHub Install

While npm publishing is not active, install from GitHub:

```bash
git clone https://github.com/jordyhaasje/Shopify.git
cd Shopify
pnpm install
pnpm run build
pnpm --filter shopify-store-agent exec shopify-store-agent auth --store your-store.myshopify.com
```

For local OAuth, add this redirect URL to the Shopify Dev Dashboard app:

```text
http://127.0.0.1:3456/auth/callback
```

See [docs/installation.md](docs/installation.md) for OAuth and manual token setup.

## Future NPM Setup

The intended future setup is:

```bash
npx shopify-store-agent setup
```

The wizard should guide users through auth, local config, capability checks, and MCP host snippets.

`shopify.capabilities.check` is partially real: by default it only inspects local config and redacted capability flags. Optional live mode performs only a minimal shop identity check and does not fetch products, orders, customers, or other sensitive data.

## Safety Model

- V1 defaults to read-only mode unless the user explicitly enables writes.
- Risky writes require preview or dry-run output plus explicit confirmation.
- Users provide products, URLs, CSV files, images, customer emails, order numbers, or Shopify IDs.
- The agent must never autonomously search for products.
- No secrets belong in the repo, docs, tests, or logs.

See [docs/safety.md](docs/safety.md), [docs/scopes.md](docs/scopes.md), and [docs/tool-contracts.md](docs/tool-contracts.md).

## Local Validation

GitHub Actions is intentionally not used for validation in this phase. Run checks locally:

```bash
pnpm run lint
pnpm run typecheck
pnpm test
pnpm run build
```

PRs are reviewed manually and merged manually.
