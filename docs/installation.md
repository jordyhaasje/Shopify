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

See [github-install.md](github-install.md) for the temporary GitHub install notes.

## Future NPM Setup

The intended future user flow is:

```bash
npx shopify-store-agent setup
```

That path is reserved for after package publishing is explicitly approved and completed. Package metadata is prepared and can be checked locally with `pnpm run pack:check`, but do not treat `npx shopify-store-agent` or `npx shopify-store-agent-mcp` as the primary working install route while packages remain unpublished.

Publishing itself is manual and gated by [release-runbook.md](release-runbook.md). Do not treat package metadata or `pack:check` as permission to publish.

The future wizard should collect or create local Shopify credentials, run capability checks, and generate MCP configuration snippets for hosts such as Codex, Claude Code, and Cursor. It should also explain that users can ask the AI host in ordinary store language; the host should translate requests into safe tool calls and ask for missing exact targets instead of requiring technical prompts.

Capability checks are safe by default. Local mode reports config status, redacted credential presence, read-only mode, local capability flags, diagnostics, and setup recommendations. Optional live mode uses the Admin API token only for a minimal shop identity check and must not return sensitive store data.

The current setup foundation supports the same shape locally for manual token fallback:

```bash
pnpm --filter shopify-store-agent run setup -- \
  --store your-store.myshopify.com \
  --auth manual
```

Setup writes local config only when run as the CLI command. Programmatic dry runs do not write config. The generated MCP snippets use `SHOPIFY_STORE_AGENT_CONFIG` and other non-secret environment values instead of printing Admin API tokens or OAuth client secrets.

Setup defaults to `readOnly: true`. The setup command itself does not perform Shopify writes, does not activate execute tools, and does not require write scopes for read/preview/smoke validation. OAuth auth also defaults to read-only Admin API scopes. Users can connect a normal store for read-only checks and previews; first write validation should happen on a development or disposable store. Explicit `write_` scopes are blocked unless write mode is explicitly requested; in this phase write mode is only for reviewed tests of `page.create.execute`, the minimal `product.create.execute` path, the basic-field `product.update.execute` path, or the custom explicit-product `collection.create.execute` path. Only `page.create.execute`, `product.create.execute`, `product.update.execute`, and `collection.create.execute` are implemented; all other execute tools remain fail-closed placeholders.

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

V1 defaults to read-only mode unless writes are explicitly enabled. The default OAuth install URL uses read-only scopes only. Do not request write scopes for setup, smoke, reads, or previews; request `write_content` or `write_online_store_pages` only when intentionally testing the reviewed `page.create.execute` path in a development store, and request `write_products` only when intentionally testing the reviewed minimal `product.create.execute`, basic-field `product.update.execute`, or custom explicit-product `collection.create.execute` path.

For deliberate development-store write testing, read-only mode must be explicitly disabled and local granted scopes must include the write scope required by the execute path. Missing or unknown write scopes fail closed before fetch. The only real execute tools in this phase are `page.create.execute`, `product.create.execute`, `product.update.execute`, and `collection.create.execute`; all other execute tools remain placeholders.

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
```

PRs are reviewed manually and merged manually for now.
