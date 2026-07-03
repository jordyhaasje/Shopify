# Shopify Store Agent

Shopify Store Agent is a local-first MCP and CLI toolkit that lets non-technical merchants manage Shopify store operations through AI hosts such as Codex, Claude Code, Cursor, and other MCP-compatible tools.

The first version focuses on safe store operations:

- Products, variants, media, pages, collections, orders, customers, refunds, tracking, bulk edits, and theme section workflows.
- Preview-first writes for risky actions.
- No autonomous product discovery. Users provide products, links, CSV files, order numbers, or customer identifiers.
- Existing email MCP servers can be used alongside this MCP inside the same AI host.

## Packages

- `packages/core`: Shopify clients, capability routing, audit logging, safety helpers.
- `packages/cli`: setup wizard and MCP config snippet generator.
- `packages/mcp`: stdio MCP server and tool registry.
- `skills`: bootstrap skill instructions for AI hosts.
- `docs`: installation, scopes, safety, and theme workflow documentation.

## Development

```bash
pnpm install
pnpm run lint
pnpm run typecheck
pnpm test
pnpm run build
```

## GitHub Install

For the current GitHub-only phase:

```bash
git clone https://github.com/jordyhaasje/Shopify.git
cd Shopify
pnpm install
pnpm run build
pnpm --filter shopify-store-agent exec shopify-store-agent auth --store your-store.myshopify.com
```

Add this redirect URL to the Shopify Dev Dashboard app before running OAuth:

```text
http://127.0.0.1:3456/auth/callback
```

## User Setup Shape

The intended user-facing setup is:

```bash
npx shopify-store-agent setup
```

The wizard collects a Shopify store URL, an Admin API token, and optionally a Theme Access token. It then generates MCP configuration snippets for Codex, Claude Code, and Cursor.
