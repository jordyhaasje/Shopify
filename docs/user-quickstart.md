# User Quickstart

## What this is

Shopify Store Agent is a local-first MCP server and CLI package for AI coding harnesses such as Codex, OpenCode, Claude Code, Cursor, and generic MCP-compatible hosts.

It is not a Shopify App Store app, embedded Admin app, SaaS dashboard, or email MCP. It helps your AI host use explicit Shopify inputs, run safe read tools, create previews, and prepare reviewed execute calls.

## What you need

- A local terminal in your AI coding harness.
- Node.js and pnpm.
- A Shopify development or disposable test store, for example `hazify-apps.myshopify.com`.
- Shopify app client ID and client secret for local OAuth.
- The redirect URL `http://127.0.0.1:3456/auth/callback` added to that Shopify app.

## What the AI can do

- Clone the repo, install dependencies, build, and run local validation.
- Run setup/auth commands when you provide local environment variables.
- Help place the MCP config in Codex, OpenCode, Claude Code, Cursor, or another MCP host.
- Run read-only checks and previews from user-provided inputs.
- Prepare an execute call from `executeRequest` for your review.

## What you must do yourself

- Provide OAuth client credentials through local environment variables.
- Open the Shopify install URL and approve the app.
- Keep secrets out of chat, docs, PRs, screenshots, and logs.
- Explicitly approve before any real write.
- Use only development or disposable stores for write tests.

## Step 1 -- Clone, install, build, smoke

```bash
git clone https://github.com/jordyhaasje/Shopify.git
cd Shopify
pnpm install
pnpm run build
pnpm run smoke:local
```

`smoke:local` must stay local/no-write and should report `fetchCalls: 0`.

## Step 2 -- Set local OAuth environment variables

```bash
export SHOPIFY_STORE="hazify-apps.myshopify.com"
export SHOPIFY_CLIENT_ID="..."
export SHOPIFY_CLIENT_SECRET="..."
```

Do not paste client secrets or generated tokens into chat, docs, PRs, screenshots, or logs.

## Step 3 -- Run OAuth

```bash
pnpm --filter shopify-store-agent run auth -- \
  --store "$SHOPIFY_STORE" \
  --client-id "$SHOPIFY_CLIENT_ID" \
  --client-secret "$SHOPIFY_CLIENT_SECRET" \
  --scopes "read_products,read_content,read_online_store_pages"
```

The CLI prints or opens a Shopify install URL. You approve the app in the browser, Shopify redirects to `http://127.0.0.1:3456/auth/callback`, and the CLI stores the Admin API token locally. The token is not for docs or chat.

## Step 4 -- Generate MCP config

```bash
pnpm --filter shopify-store-agent run setup -- --store "$SHOPIFY_STORE" --auth oauth
```

`setup --auth oauth` generates guidance and MCP snippets. The actual browser OAuth flow is `auth`.

## Step 5 -- Add MCP config to your AI host

For the current GitHub install, use the local node MCP command:

```toml
[mcp_servers.shopify-store-agent]
command = "node"
args = ["/absolute/path/to/Shopify/packages/mcp/dist/server.js"]

[mcp_servers.shopify-store-agent.env]
SHOPIFY_STORE_AGENT_CONFIG = "/Users/<user>/.shopify-store-agent/config.json"
SHOPIFY_STORE_AGENT_STORE = "hazify-apps.myshopify.com"
SHOPIFY_STORE_AGENT_API_VERSION = "2026-07"
SHOPIFY_STORE_AGENT_READ_ONLY = "true"
```

The current working route is GitHub clone plus local node MCP command. npm/npx is a future path after package publishing.

## Step 6 -- Check the connection

Ask your AI host:

```text
List the available Shopify Store Agent MCP tools. Do not run writes.
```

Then:

```text
Run shopify.capabilities.check. Do not show secrets or raw config.
```

Read example:

```text
Use product.get for product handle "<test-handle>" and return only a minimal summary.
```

## Step 7 -- Create a preview

Ask your AI host:

```text
Create a page.create.preview for a draft test page:
title: Store Agent Test Page
body: <p>Temporary validation page.</p>
handle: store-agent-test-page

Do not execute yet. Show the preview and executeRequest helper.
```

Preview output includes `executeRequest` for:

```text
page.create.preview -> page.create.execute
product.create.preview -> product.create.execute
```

## Step 8 -- Approve and execute

Safe flow:

```text
User reviews preview.
User explicitly says: I approve this preview. Execute it.
AI uses executeRequest plus confirmed: true.
Execute still validates stored preview binding.
```

Never execute just because `executeRequest` exists. It is a review helper, not auto-execute.

Real writes require explicit development-store write setup:

```bash
pnpm --filter shopify-store-agent run auth -- \
  --store "$SHOPIFY_STORE" \
  --client-id "$SHOPIFY_CLIENT_ID" \
  --client-secret "$SHOPIFY_CLIENT_SECRET" \
  --write-enabled \
  --scopes "read_products,read_content,read_online_store_pages,write_products,write_content"
```

Use only a development or disposable store. `write_products` is required for `product.create.execute`; `write_content` or `write_online_store_pages` is required for `page.create.execute`. All other execute tools are placeholders.

## Safety rules

- Read-only by default.
- No production write tests.
- No secrets in chat, docs, PRs, screenshots, or logs.
- Preview before execute.
- Execute requires explicit user approval.
- `executeRequest` is not auto-execute.
- Stored preview binding is required.
- Do not use loose execute input as the source of truth.
- No raw Shopify node dumps.
- No raw customer, order, or product dumps.
- `pnpm run smoke:local` must stay local/no-write and report `fetchCalls: 0`.

## Troubleshooting

- OAuth callback fails: confirm the Shopify app allows `http://127.0.0.1:3456/auth/callback`.
- MCP host cannot start: run `pnpm run build` and confirm the config path points to `packages/mcp/dist/server.js`.
- Missing token diagnostics: rerun `auth`; do not paste the generated token anywhere.
- Read tool returns missing input: provide a handle, Shopify ID, order number, email, or tracking reference.
- Execute is blocked: confirm read-only mode is disabled only for a development-store test, required write scopes are granted, preview is from the same MCP server process, `confirmed: true` is present, and the `executeRequest` values were not changed.
- Preview expired or disappeared: create a new preview in the same MCP server process.

## Current capabilities

Read tools:

```text
shopify.capabilities.check
order.find
order.get
customer.find
tracking.get
product.get
```

Preview tools:

```text
product.create.preview
product.update.preview
product.media.update.preview
product.importFromUserUrl.preview
page.create.preview
collection.create.preview
```

Real execute tools:

```text
page.create.execute
product.create.execute
```

Placeholder execute tools:

```text
product.update.execute
product.media.update.execute
product.importFromUserUrl.execute
collection.create.execute
customer.updateAddress.execute
tracking.update.execute
refund.execute
bulk.execute
theme.apply
theme.rollback
```

## Not available yet

- npm/npx package install as the primary route.
- Production-store write automation.
- Product update, collection create, refund, tracking, customer, bulk, theme, variants, media, inventory, metafields, and collection execute implementations.
- Automated live Shopify tests.
- Persistent preview storage across MCP server restarts.
