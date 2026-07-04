# Shopify Store Agent

Shopify Store Agent is a local-first MCP server, CLI wizard, and bootstrap skill package for AI hosts such as Codex, Claude Code, Cursor, and other MCP-compatible tools.

It helps an AI host work with Shopify store data and store-management workflows. Existing email MCP servers can be connected separately in the same host so the model can combine customer emails with Shopify order/customer context.

## What It Is Not

Shopify Store Agent is not a Shopify App Store app, not an embedded Shopify Admin app, and not a merchant-facing Shopify application.

Shopify OAuth, when used, is only a local install/auth mechanism for the MCP/CLI package. Manual Admin API token setup remains supported.

## Start Here

New users should start with the compact [User Quickstart](docs/user-quickstart.md). It walks through GitHub install, local OAuth, MCP host config, first read, first preview, and reviewed execute flow for Codex, OpenCode, Claude Code, Cursor, and generic MCP-compatible hosts.

For the canonical product goal, current MVP status, implementation roadmap, and Codex operating rules, see [Product Goal And Roadmap](docs/product-goal-and-roadmap.md).

## Current Status

The foundation is in place: auth, config storage, documentation, MCP SDK startup, setup wizard scaffolding, safety helpers, Admin GraphQL client, capability diagnostics, and structured catalog/content preview helpers.

Real read-only Shopify MCP tools are implemented for `shopify.capabilities.check`, `order.find`, `order.get`, `customer.find`, `tracking.get`, and `product.get`.

Structured preview tools are implemented for `product.create.preview`, `product.update.preview`, `product.media.update.preview`, `product.importFromUserUrl.preview`, `page.create.preview`, and `collection.create.preview`. These previews summarize user-provided inputs, validate required fields, create audit entries, and do not call Shopify write APIs or perform mutations. `product.create.preview` and `page.create.preview` also return a safe `executeRequest` helper so AI hosts can prepare the matching execute call for user review without manually copying every hash and payload field.

`product.update.preview` can optionally enrich before-values with the read-only `product.get` path when the caller supplies an explicit `productId`, `id`, or `handle` and sets `enrichExistingProduct: true`. It does not search for products, does not fetch when an existing product summary is already supplied, and falls back to `before: "unknown"` with a warning when enrichment is unavailable.

Preview results are also saved to a local in-memory preview store. Stored records contain safe preview content, TTL metadata, unique per-preview `previewId` values, and deterministic `previewHash` values that can later be compared with hashes recomputed from the actual reviewed payload. The store is not file-backed yet, does not persist across process restarts, and never performs Shopify calls.

The `executeRequest` helper is not auto-execute. It still requires explicit user approval and `confirmed: true`, and the existing execute path still verifies the active stored preview, target, expected tool, `previewHash`, reviewed payload, and `reviewedChangesHash` before any write can happen.

`page.create.execute` is the first limited real Shopify write tool. It only attempts the Shopify page create mutation when read-only mode is disabled, local granted scopes include `write_content` or `write_online_store_pages`, a stored `page.create.preview` record exists, the preview is not expired, the reviewed payload hashes back to the stored preview, the target/tool/hash binding matches, and `confirmed: true` is present. After successful creation it performs a safe read-after-write verification by created page ID only. It returns only a safe created-page summary, safe verification summary, or safe Shopify user/error diagnostics.

`product.create.execute` is the second limited real Shopify write tool. It only attempts the Shopify product create mutation when read-only mode is disabled, local granted scopes include `write_products`, a stored `product.create.preview` record exists, the preview is not expired, the reviewed payload hashes back to the stored preview, the target/tool/hash binding matches, and `confirmed: true` is present. This product-create path supports only minimal product fields from the reviewed preview: title, description/body HTML summary, vendor, product type, status, and tags. It does not create variants, inventory, media/files/images, collections, metafields, SEO bulk changes, publications, translations, updates, deletes, or bulk operations.

`product.update.execute` is the third limited real Shopify write tool. It only attempts the Shopify `productUpdate` mutation when read-only mode is disabled, local granted scopes include `write_products`, a stored `product.update.preview` record exists, the preview is not expired, the reviewed payload hashes back to the stored preview, the target/tool/hash binding matches, and `confirmed: true` is present. It supports only basic product fields from the stored reviewed preview: title, description/descriptionHtml mapped to `descriptionHtml`, vendor, product type, status, and tags. Handle-only previews fail closed unless the stored preview contains a safe product ID. It does not implement variants, inventory, media/files/images, collections, metafields, SEO, publications, translations, deletes, or bulk operations.

All other write tools are still guarded fail-closed placeholders, including product media/import execute, customer address update execute, refund execute, tracking update execute, collection execute, bulk execute, and theme apply. Confirmation alone is insufficient: callers must provide a `previewId` plus reviewed payload context that can be tied to the expected preview tool, target, preview hash, and reviewed changes hash. Missing, expired, or mismatched preview binding fails closed and is audited as `blocked`; validly bound placeholders are audited as `not_implemented`, never `success`.

## Temporary GitHub Install

While npm publishing is not active, install from GitHub and build locally:

```bash
git clone https://github.com/jordyhaasje/Shopify.git
cd Shopify
pnpm install
pnpm run build
pnpm --filter shopify-store-agent run setup -- --store your-store.myshopify.com
```

The generated MCP snippets use the local build by default:

```text
node /absolute/path/to/Shopify/packages/mcp/dist/server.js
```

Snippets point to `SHOPIFY_STORE_AGENT_CONFIG` and non-secret environment values. They must not include Admin API tokens, OAuth client secrets, or Theme Access tokens.

For local OAuth, add this redirect URL to the Shopify Dev Dashboard app:

```text
http://127.0.0.1:3456/auth/callback
```

OAuth is the recommended auth route when the user has Shopify app client credentials. Run `shopify-store-agent auth` through pnpm to open the browser install flow and store the resulting Admin API token locally. `setup --auth oauth` only prints guidance and MCP snippets; it does not exchange a token. Manual Admin API token setup remains supported as a fallback.

Start with [docs/user-quickstart.md](docs/user-quickstart.md). See [docs/installation.md](docs/installation.md) for OAuth and manual token setup, [docs/ai-operator-guide.md](docs/ai-operator-guide.md) for deeper Codex/OpenCode/Claude Code/Cursor operator guidance, and [docs/dev-store-e2e-runbook.md](docs/dev-store-e2e-runbook.md) for manual development-store validation.

## Future NPM Setup

The intended future setup is:

```bash
npx shopify-store-agent setup
```

That npm/npx path is not the primary working route until package publishing is active.

The wizard guides users through store URL normalization, manual-token or local-OAuth setup guidance, read-only local config, capability checks, and MCP host snippets for Codex, Claude Code, Cursor, and generic MCP-compatible hosts. Setup and OAuth auth default to read-only scopes and do not request or activate write mode for read/preview validation.

Local smoke validation is available before connecting a store:

```bash
pnpm run smoke:local
```

The default smoke path is local/mocked only. It checks setup, MCP snippets, local capability diagnostics, preview storage, and execute placeholder fail-closed behavior without Shopify writes or mutations.

`shopify.capabilities.check` is partially real: by default it only inspects local config and redacted capability flags. Optional live mode performs only a minimal shop identity check and does not fetch products, orders, customers, or other sensitive data.

## Safety Model

- V1 defaults to read-only mode unless the user explicitly enables writes.
- Risky writes require preview or dry-run output plus explicit confirmation.
- Users provide products, URLs, CSV files, images, customer emails, order numbers, or Shopify IDs.
- The agent must never autonomously search for products.
- No secrets belong in the repo, docs, tests, or logs.

See [docs/safety.md](docs/safety.md), [docs/scopes.md](docs/scopes.md), and [docs/tool-contracts.md](docs/tool-contracts.md).
For dev-store readiness, see [docs/dev-store-validation.md](docs/dev-store-validation.md) and the full [docs/dev-store-e2e-runbook.md](docs/dev-store-e2e-runbook.md).

## Local Validation

GitHub Actions is intentionally not used for validation in this phase. Run checks locally:

```bash
pnpm run lint
pnpm run typecheck
pnpm test
pnpm run build
pnpm run smoke:local
```

PRs are reviewed manually and merged manually.
