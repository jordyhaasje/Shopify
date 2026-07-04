# Shopify Store Agent

Shopify Store Agent is a local-first MCP server, CLI wizard, and bootstrap skill package for AI hosts such as Codex, Claude Code, Cursor, and other MCP-compatible tools.

It helps an AI host work with Shopify store data and store-management workflows. Existing email MCP servers can be connected separately in the same host so the model can combine customer emails with Shopify order/customer context.

## What It Is Not

Shopify Store Agent is not a Shopify App Store app, not an embedded Shopify Admin app, and not a merchant-facing Shopify application.

Shopify OAuth, when used, is only a local install/auth mechanism for the MCP/CLI package. Manual Admin API token setup remains supported.

## Current Status

The foundation is in place: auth, config storage, documentation, MCP SDK startup, setup wizard scaffolding, safety helpers, Admin GraphQL client, capability diagnostics, and structured catalog/content preview helpers.

Real read-only Shopify MCP tools are implemented for `shopify.capabilities.check`, `order.find`, `order.get`, `customer.find`, `tracking.get`, and `product.get`.

Structured preview tools are implemented for `product.create.preview`, `product.update.preview`, `product.media.update.preview`, `product.importFromUserUrl.preview`, `page.create.preview`, and `collection.create.preview`. These previews summarize user-provided inputs, validate required fields, create audit entries, and do not call Shopify write APIs or perform mutations.

`product.update.preview` can optionally enrich before-values with the read-only `product.get` path when the caller supplies an explicit `productId`, `id`, or `handle` and sets `enrichExistingProduct: true`. It does not search for products, does not fetch when an existing product summary is already supplied, and falls back to `before: "unknown"` with a warning when enrichment is unavailable.

Preview results are also saved to a local in-memory preview store. Stored records contain safe preview content, TTL metadata, unique per-preview `previewId` values, and deterministic `previewHash` values that can later be compared with hashes recomputed from the actual reviewed payload. The store is not file-backed yet, does not persist across process restarts, and never performs Shopify calls.

Write tools are still guarded fail-closed placeholders, including product create/update execute, customer address update execute, refund execute, tracking update execute, page/collection execute, bulk execute, and theme apply. No Shopify mutations are implemented yet.

Execute placeholders require preview binding context before they reach the not-implemented placeholder response. Confirmation alone is insufficient: callers must provide a `previewId` plus reviewed payload context that can be tied to the expected preview tool, target, preview hash, and reviewed changes hash. Missing, expired, or mismatched preview binding fails closed and is audited as `blocked`; validly bound placeholders are audited as `not_implemented`, never `success`.

## Temporary GitHub Install

While npm publishing is not active, install from GitHub:

```bash
git clone https://github.com/jordyhaasje/Shopify.git
cd Shopify
pnpm install
pnpm run build
pnpm --filter shopify-store-agent exec shopify-store-agent setup --store your-store.myshopify.com
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

The wizard guides users through store URL normalization, manual-token or local-OAuth setup guidance, read-only local config, capability checks, and MCP host snippets for Codex, Claude Code, Cursor, and generic MCP-compatible hosts. Setup and OAuth auth default to read-only scopes, do not request write scopes for read/preview mode, and do not implement or activate Shopify writes.

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
