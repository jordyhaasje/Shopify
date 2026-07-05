# Installation

Shopify Store Agent is a local-first MCP + CLI + bootstrap skill package for AI hosts. It is not a Shopify App Store app or embedded Shopify Admin app.

New users should start with [user-quickstart.md](user-quickstart.md). This installation document is the deeper reference for setup, OAuth, manual token fallback, local config, and validation details.

## Current GitHub-Only Setup

This path is temporary while npm publishing is not active. It is the current primary working route:

```bash
git clone https://github.com/jordyhaasje/Shopify.git
cd Shopify
pnpm install
pnpm run build
pnpm --filter shopify-store-agent run setup -- --store your-store.myshopify.com
```

The setup command is for local config, MCP snippets, and guidance. It does not run the OAuth browser install flow. For the current GitHub-only install, generated MCP snippets default to a local node command that points at the built MCP server:

```text
node /absolute/path/to/Shopify/packages/mcp/dist/server.js
```

## Future NPM Setup

The future package-distributed user flow is:

```bash
npx shopify-store-agent setup
```

That path is reserved for after package publishing is explicitly approved and completed. Package metadata is prepared and can be checked locally with `pnpm run pack:check`, but do not treat `npx shopify-store-agent` or `npx shopify-store-agent-mcp` as the primary working install route while packages remain unpublished.

Publishing itself is manual and gated by [release-runbook.md](release-runbook.md). Do not treat package metadata or `pack:check` as permission to publish.

The current CLI already provides the local setup foundation through the GitHub route: `setup` creates local config guidance and MCP snippets, `auth` runs the browser OAuth flow, `setup-check` verifies local onboarding state without Shopify fetches, and `smoke --dry-run` validates the local no-write path. Future npm/npx publishing should distribute that same reviewed behavior, not introduce a different install or write model.

Setup guidance explains that users can ask the AI host in ordinary store language. The host should translate requests into safe tool calls and ask for missing exact targets instead of requiring technical prompts.

Capability checks are safe by default. Local mode reports config status, redacted credential presence, read-only mode, local capability flags, diagnostics, and setup recommendations. Optional live mode uses the Admin API token only for a minimal shop identity check and must not return sensitive store data.

The current setup foundation supports the same shape locally for manual token fallback:

```bash
pnpm --filter shopify-store-agent run setup -- \
  --store your-store.myshopify.com \
  --auth manual
```

Setup writes local config only when run as the CLI command. Programmatic dry runs do not write config. The generated MCP snippets use `SHOPIFY_STORE_AGENT_CONFIG` and other non-secret environment values instead of printing Admin API tokens or OAuth client secrets.

Setup defaults to `readOnly: true`. The setup command itself does not perform Shopify writes, does not activate execute tools, and does not require write scopes for read/preview/smoke validation. OAuth auth also defaults to read-only Admin API scopes. Users can connect a normal store for read-only checks and previews; first write validation should happen on a development or disposable store. Explicit `write_` scopes are blocked unless write mode is explicitly requested; in this phase write mode is only for reviewed tests of `page.create.execute`, the minimal `product.create.execute` path, the basic-field, explicit-variant-price, explicit-variant-create, explicit-option-create, explicit-option-delete, explicit-option-reorder, explicit-option-rename, explicit-option-value-rename, explicit-option-value-add, or explicit-option-value-delete `product.update.execute` path, the add-only `product.media.update.execute` path, the custom explicit-product `collection.create.execute` path, or the explicit single-item `inventory.setQuantity.execute`, `inventory.adjustQuantity.execute`, same-location state `inventory.moveQuantity.execute`, draft transfer `inventory.transfer.execute`, transfer add-item quantity set `inventory.transfer.addItems.execute`, transfer mark-ready `inventory.transfer.markReady.execute`, transfer cancel `inventory.transfer.cancel.execute`, transfer ship `inventory.transfer.ship.execute`, and transfer receive `inventory.transfer.receive.execute` paths. Only `page.create.execute`, `product.create.execute`, `product.update.execute`, `product.media.update.execute`, `collection.create.execute`, `inventory.setQuantity.execute`, `inventory.adjustQuantity.execute`, `inventory.moveQuantity.execute`, `inventory.transfer.execute`, `inventory.transfer.addItems.execute`, `inventory.transfer.markReady.execute`, `inventory.transfer.cancel.execute`, `inventory.transfer.ship.execute`, and `inventory.transfer.receive.execute` are implemented; all other execute tools remain fail-closed placeholders.

## Local Setup Check

After `setup` and `auth`, use `setup-check` to verify that the local onboarding state is ready before troubleshooting the MCP host:

```bash
pnpm --filter shopify-store-agent run setup-check -- --store your-store.myshopify.com
```

`setup-check` is local-only. It reads the configured local config file, confirms the expected store when `--store` is provided, reports whether an Admin API token is configured locally, verifies read-only mode is still enabled for normal-store onboarding, checks that generated MCP snippets do not include raw tokens, confirms the local MCP server build path exists, returns a compact list of supported snippet hosts, returns the safe starter prompts, and reports `fetchCalls: 0`. It does not print local paths or full MCP config snippets; use `setup` for the actual host snippets.

If `setup-check` reports a missing local MCP server path, run `pnpm run build`. If it reports missing config or token state, rerun `setup` and then the real OAuth `auth` flow or manual token setup. Do not paste config files, tokens, OAuth client secrets, or raw local config contents into public issues or PRs.

## Local Smoke Validation

Run smoke validation after install/setup changes and before testing against a development store:

```bash
pnpm run smoke:local
```

The default smoke path is local/mocked only. It builds dry-run setup config, verifies read-only mode, runs local capability diagnostics, generates MCP snippets, creates a preview, checks the local preview store, and confirms execute placeholders return `blocked` for invalid binding and `not_implemented` for valid stored binding.

Optional live mode is limited to the minimal capability check and must be explicitly requested:

```bash
pnpm --filter shopify-store-agent run smoke -- --live --admin-token "$SHOPIFY_ADMIN_TOKEN"
```

Smoke validation does not perform Shopify writes, does not run mutations, and does not fetch products, orders, or customers by default. It should report `fetchCalls: 0` in local mode. Use [dev-store-validation.md](dev-store-validation.md) as the quick readiness checklist and [dev-store-e2e-runbook.md](dev-store-e2e-runbook.md) as the full manual development-store MVP runbook.

## Local OAuth Setup

Local OAuth is only an install/auth mechanism for this MCP/CLI package. It is the recommended auth route when the user has Shopify app client credentials. Manual Admin API token setup remains supported as a fallback.

Before running OAuth, add this redirect URL to the Shopify Dev Dashboard app:

```text
http://127.0.0.1:3456/auth/callback
```

Then run the real OAuth browser flow with `auth`:

```bash
pnpm --filter shopify-store-agent run auth -- \
  --store your-store.myshopify.com \
  --client-id "$SHOPIFY_CLIENT_ID" \
  --client-secret "$SHOPIFY_CLIENT_SECRET"
```

The CLI opens or prints an install URL, validates the callback state/HMAC, exchanges the OAuth code, and stores the resulting Admin API token locally. If the store has multiple connected domains, Shopify can return the original canonical `.myshopify.com` domain in the OAuth callback even when `--store` used the primary storefront domain; `auth` stores that canonical shop domain for Admin API calls and reports it in the terminal. The token, OAuth client secret, and local config contents must never be pasted into docs, PRs, screenshots, logs, or chat.

`setup --auth oauth` is only guidance for local config and MCP snippets. It does not run the browser flow, does not exchange a token, and does not overwrite a working token-bearing OAuth config with incomplete tokenless config.

If `auth` prompts for the OAuth client secret interactively, the secret input is hidden. Prefer local environment variables or the hidden prompt; do not paste secrets into docs, chat, PRs, screenshots, or logs.

V1 defaults to read-only mode unless writes are explicitly enabled. The default OAuth install URL uses read-only scopes only. Do not request write scopes for setup, smoke, reads, or previews; request `write_content` or `write_online_store_pages` only when intentionally testing the reviewed `page.create.execute` path in a development store, request `write_products` only when intentionally testing the reviewed minimal `product.create.execute`, basic-field, explicit-variant-price, explicit-variant-create, explicit-option-create, explicit-option-delete, explicit-option-reorder, explicit-option-rename, explicit-option-value-rename, explicit-option-value-add, or explicit-option-value-delete `product.update.execute`, add-only `product.media.update.execute`, or custom explicit-product `collection.create.execute` path, request `write_inventory` only when intentionally testing `inventory.setQuantity.execute`, `inventory.adjustQuantity.execute`, or `inventory.moveQuantity.execute`, request both `write_inventory_transfers` and `read_inventory_transfers` when intentionally testing `inventory.transfer.execute`, `inventory.transfer.markReady.execute`, or `inventory.transfer.cancel.execute`, add `read_inventory` when intentionally testing `inventory.transfer.addItems.execute`, request both `write_inventory_shipments` and `read_inventory_shipments` only when intentionally testing `inventory.transfer.ship.execute`, and request both `write_inventory_shipments_received_items` and `read_inventory_shipments` only when intentionally testing `inventory.transfer.receive.execute`.

For deliberate development-store write testing, read-only mode must be explicitly disabled and local granted scopes must include the write scope required by the execute path. Missing or unknown write scopes fail closed before fetch. The only real execute tools in this phase are `page.create.execute`, `product.create.execute`, `product.update.execute`, `product.media.update.execute`, `collection.create.execute`, `inventory.setQuantity.execute`, `inventory.adjustQuantity.execute`, `inventory.moveQuantity.execute`, `inventory.transfer.execute`, `inventory.transfer.addItems.execute`, `inventory.transfer.markReady.execute`, `inventory.transfer.cancel.execute`, `inventory.transfer.ship.execute`, and `inventory.transfer.receive.execute`; all other execute tools remain placeholders.

## Manual Admin API Token Setup

Manual token setup remains supported. A tester can create or use a Shopify custom app for their own development store, choose only the scopes required for the enabled workflow, install the app, and copy the Admin API access token into local config or environment variables.

Manual config should provide:

- Store URL.
- Admin API access token.
- Optional Theme Access token.
- Read-only setting.

The setup wizard can create the same local config path with:

```bash
pnpm --filter shopify-store-agent run setup -- \
  --store your-store.myshopify.com \
  --auth manual \
  --admin-token "$SHOPIFY_ADMIN_TOKEN"
```

Do not paste real tokens into shared logs, PRs, issue comments, screenshots, or docs.

## Local Config Storage

The OAuth flow stores local config here by default:

```text
~/.shopify-store-agent/config.json
```

That file is local machine state. It must not be committed, pasted into chat, or copied into docs/tests/logs.

The MCP default context stores safe preview binding records here by default:

```text
~/.shopify-store-agent/previews.json
```

When `SHOPIFY_STORE_AGENT_CONFIG` points to a custom config path, preview records are stored as `previews.json` beside that config file. Set `SHOPIFY_STORE_AGENT_PREVIEW_STORE` to override the preview-store path. The preview store contains sanitized binding material only; it must not contain raw reviewed payloads, raw Shopify nodes, tokens, or customer/order data.

The MCP default context also stores safe audit entries locally:

```text
~/.shopify-store-agent/audit.jsonl
```

When `SHOPIFY_STORE_AGENT_CONFIG` points to a custom config path, audit entries are stored as `audit.jsonl` beside that config file. Set `SHOPIFY_STORE_AGENT_AUDIT_LOG` or config `auditLogPath` to override the audit path. The audit log contains compact tool metadata only; it must not contain secrets, raw Shopify nodes, raw reviewed payloads, or customer/order dumps.

The setup wizard prints MCP snippets for:

- Codex.
- Claude Code.
- Cursor.
- Generic MCP-compatible hosts.

It also prints "First AI prompts" for the connected host. These starter prompts avoid tool names and GraphQL IDs, but they do not weaken safety rules: the AI host still has to ask for missing exact targets, create previews for changes, and wait for explicit approval before execute.

Snippets point to the local config path and non-secret setup values. They should not include raw Admin API tokens, OAuth client secrets, or Theme Access tokens.

After copying the snippet, `setup-check` is the quickest local verification that local config, token presence, read-only mode, build path, and starter prompts are ready. It summarizes supported snippet hosts instead of reprinting full MCP config or local paths. It does not prove that a specific AI host has reloaded its MCP config; restart or reload the host after changing snippets.

Current GitHub-only snippets use the local build:

```toml
[mcp_servers.shopify-store-agent]
command = "node"
args = ["/absolute/path/to/Shopify/packages/mcp/dist/server.js"]

[mcp_servers.shopify-store-agent.env]
SHOPIFY_STORE_AGENT_CONFIG = "/Users/<user>/.shopify-store-agent/config.json"
SHOPIFY_STORE_AGENT_STORE = "your-store.myshopify.com"
SHOPIFY_STORE_AGENT_API_VERSION = "2026-07"
SHOPIFY_STORE_AGENT_READ_ONLY = "true"
```

The future npm/npx route can be selected later once packages are published.

Never paste or commit:

- Admin API access tokens.
- OAuth client secrets.
- Theme Access tokens.
- Real customer/order data.
- Store credentials or private app credentials.

## Email MCPs

This project does not include an email MCP. Users should connect an existing Gmail, Outlook, IMAP, or helpdesk MCP in the same AI host. The host can combine email context with Shopify tools.

## Validation

GitHub Actions is not currently used for validation because the GitHub account has an Actions/billing issue. Validate locally:

```bash
pnpm run lint
pnpm run typecheck
pnpm test
pnpm run build
pnpm run smoke:local
```

PRs are reviewed manually and merged manually for now.
