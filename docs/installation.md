# Installation

Shopify Store Agent is a local-first MCP + CLI + bootstrap skill package for AI hosts. It is not a Shopify App Store app or embedded Shopify Admin app.

## Current GitHub-Only Setup

This path is temporary while npm publishing is not active:

```bash
git clone https://github.com/jordyhaasje/Shopify.git
cd Shopify
pnpm install
pnpm run build
pnpm --filter shopify-store-agent run setup -- --store your-store.myshopify.com
```

See [github-install.md](github-install.md) for the temporary GitHub install notes.

## Future NPM Setup

The intended future user flow is:

```bash
npx shopify-store-agent setup
```

The wizard should collect or create local Shopify credentials, run capability checks, and generate MCP configuration snippets for hosts such as Codex, Claude Code, and Cursor.

Capability checks are safe by default. Local mode reports config status, redacted credential presence, read-only mode, local capability flags, diagnostics, and setup recommendations. Optional live mode uses the Admin API token only for a minimal shop identity check and must not return sensitive store data.

The current setup foundation supports the same shape locally:

```bash
pnpm --filter shopify-store-agent run setup -- \
  --store your-store.myshopify.com \
  --auth manual
```

Setup writes local config only when run as the CLI command. Programmatic dry runs do not write config. The generated MCP snippets use `SHOPIFY_STORE_AGENT_CONFIG` and other non-secret environment values instead of printing Admin API tokens or OAuth client secrets.

Setup defaults to `readOnly: true`. The setup command itself does not perform Shopify writes, does not activate execute tools, and does not require write scopes for read/preview/smoke validation. OAuth auth also defaults to read-only Admin API scopes. Explicit `write_` scopes are blocked unless write mode is explicitly requested; in this phase write mode is only for reviewed development-store testing of `page.create.execute` or the minimal `product.create.execute` path. All other execute tools remain fail-closed placeholders.

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

Local OAuth is only an install/auth mechanism for this MCP/CLI package.

Before running OAuth, add this redirect URL to the Shopify Dev Dashboard app:

```text
http://127.0.0.1:3456/auth/callback
```

Then run:

```bash
pnpm --filter shopify-store-agent run auth -- --store your-store.myshopify.com
```

The CLI asks for the Shopify app client ID and client secret, opens or prints an install URL, validates the callback state/HMAC, exchanges the OAuth code, and stores the resulting Admin API token locally.

V1 defaults to read-only mode unless writes are explicitly enabled. The default OAuth install URL uses read-only scopes only. Do not request write scopes for setup, smoke, reads, or previews; request `write_content` or `write_online_store_pages` only when intentionally testing the reviewed `page.create.execute` path in a development store, and request `write_products` only when intentionally testing the reviewed minimal `product.create.execute` path.

For deliberate development-store write testing, read-only mode must be explicitly disabled and local granted scopes must include the write scope required by the execute path. Missing or unknown write scopes fail closed before fetch. The only real execute tools in this phase are `page.create.execute` and `product.create.execute`; all other execute tools remain placeholders.

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

The setup wizard prints MCP snippets for:

- Codex.
- Claude Code.
- Cursor.
- Generic MCP-compatible hosts.

Snippets point to the local config path and non-secret setup values. They should not include raw Admin API tokens, OAuth client secrets, or Theme Access tokens.

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
