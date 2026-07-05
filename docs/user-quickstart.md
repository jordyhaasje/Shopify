# User Quickstart

## What this is

Shopify Store Agent is a local-first MCP server and CLI package for AI coding harnesses such as Codex, OpenCode, Claude Code, Cursor, and generic MCP-compatible hosts.

It is not a Shopify App Store app, embedded Admin app, SaaS dashboard, or email MCP. It helps your AI host use explicit Shopify inputs, run safe read tools, create previews, and prepare reviewed execute calls.

## What you need

- A local terminal in your AI coding harness.
- Node.js and pnpm.
- A Shopify store. Use a development or disposable test store for first write validation; normal stores can be connected for read-only checks and reviewed production use.
- Shopify app client ID and client secret for local OAuth.
- The redirect URL `http://127.0.0.1:3456/auth/callback` added to that Shopify app.

## What the AI can do

- Clone the repo, install dependencies, build, and run local validation.
- Run setup/auth commands when you provide local environment variables.
- Help place the MCP config in Codex, OpenCode, Claude Code, Cursor, or another MCP host.
- Translate ordinary store-language requests into safe read tools, previews, or follow-up questions.
- Run read-only checks and previews from user-provided inputs.
- Prepare an execute call from `executeRequest` for your review.

## What you must do yourself

- Provide OAuth client credentials through local environment variables.
- Open the Shopify install URL and approve the app.
- Keep secrets out of chat, docs, PRs, screenshots, and logs.
- Explicitly approve before any real write.
- Use development or disposable stores for first write tests before enabling writes on a normal store.

## How to talk to the AI

You do not need to know technical handles, GraphQL IDs, or tool names for everyday use. Ask in normal store language:

```text
Maak een conceptpagina voor ons retourbeleid en laat mij eerst de preview zien.
```

```text
Pas de titel en tags van het linnen overhemd aan, maar voer niets uit voordat ik akkoord geef.
```

```text
Zoek de bestelling waar deze klant over mailt en geef alleen een korte status.
```

The AI host should translate your request into Shopify Store Agent tools. When the current tool needs an exact target, the AI should ask for a product link, product title, order number, customer email, Shopify ID, handle, or another user-confirmed identifier. It must not guess which product, order, or customer you meant.

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
  --scopes "read_products,read_content,read_online_store_pages,read_inventory,read_locations"
```

The CLI prints or opens a Shopify install URL. You approve the app in the browser, Shopify redirects to `http://127.0.0.1:3456/auth/callback`, and the CLI stores the Admin API token locally. The token is not for docs or chat.

## Step 4 -- Generate MCP config

```bash
pnpm --filter shopify-store-agent run setup -- --store "$SHOPIFY_STORE" --auth oauth
```

`setup --auth oauth` generates guidance and MCP snippets. The actual browser OAuth flow is `auth`.

Setup also prints "First AI prompts". These are safe starter prompts you can paste into Codex, OpenCode, Claude Code, Cursor, or another MCP host after adding the MCP config. They are written in normal store language and still require the AI to ask for missing exact targets before tool calls.

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

## Step 6 -- Check local setup

Before asking the AI host to use Shopify Store Agent, run the local setup check:

```bash
pnpm --filter shopify-store-agent run setup-check -- --store "$SHOPIFY_STORE"
```

This verifies the local config exists, an Admin API token is configured locally, read-only mode is still enabled for safe onboarding, the local MCP server build exists, host snippets are safe, starter prompts are available, and no Shopify fetches were made. It should report:

```json
{
  "mode": "local",
  "fetchCalls": 0
}
```

If this fails, fix setup/auth/build before troubleshooting the AI host.

## Step 7 -- Check the connection

Use one of the setup "First AI prompts", or ask your AI host:

```text
Check my Shopify connection and tell me only whether the store is ready. Do not show secrets or raw config.
```

Then:

```text
List the available Shopify Store Agent MCP tools. Do not run writes.
```

Read example:

```text
Look up the order or customer I provide and return only a minimal status summary. Do not show raw Shopify data.
```

Inventory lookup example:

```text
Use this SKU to find the inventory item and location IDs I need for a reviewed inventory quantity preview. Do not write anything.
```

Inventory location lookup example:

```text
Use this location name to find the Shopify location ID I need for a reviewed inventory preview. Do not write anything.
```

## Step 8 -- Create a preview

Ask your AI host:

```text
Create a draft page preview for our return policy. Ask me for any missing content first, and do not execute until I explicitly approve.
```

Preview output includes `executeRequest` for:

```text
page.create.preview -> page.create.execute
product.create.preview -> product.create.execute
collection.create.preview -> collection.create.execute
inventory.setQuantity.preview -> inventory.setQuantity.execute
inventory.adjustQuantity.preview -> inventory.adjustQuantity.execute
inventory.moveQuantity.preview -> inventory.moveQuantity.execute
```

## Step 9 -- Approve and execute

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
  --scopes "read_products,read_content,read_online_store_pages,read_inventory,read_locations,write_products,write_content,write_inventory"
```

Use only a development or disposable store. `write_products` is required for `product.create.execute`, `product.update.execute`, and custom `collection.create.execute`; `write_content` or `write_online_store_pages` is required for `page.create.execute`; `write_inventory` is required for `inventory.setQuantity.execute`, `inventory.adjustQuantity.execute`, and `inventory.moveQuantity.execute`. `product.update.execute` supports one update shape per preview: basic product fields, explicit variant price updates with product ID plus variant IDs and prices, explicit variant creation with product ID plus option values and optional price/SKU, explicit option creation with product ID plus option names and values, explicit option delete with product ID plus option IDs, explicit option reorder with product ID plus option IDs or names in the desired order, explicit option rename with product ID, option ID, and new option name, explicit option value rename with product ID, option ID, option value ID, and new value name, explicit option value add with product ID, option ID, and new value names, or explicit option value delete with product ID, option ID, and option value IDs. Option creation, option rename, option value rename, option value add, and option value delete use `LEAVE_AS_IS`; option delete uses `NON_DESTRUCTIVE`; option reorder uses `productOptionsReorder`. `inventory.setQuantity.execute` supports one explicit inventory item ID and one explicit location ID per reviewed preview, with compare quantity checks unless explicitly ignored. `inventory.adjustQuantity.execute` supports one explicit inventory item ID, one explicit location ID, and one non-zero delta per reviewed preview. `inventory.moveQuantity.execute` supports one explicit inventory item ID, one explicit location ID, one positive quantity, and supported source/destination quantity names per reviewed preview. Do not mix update shapes in one preview. All other execute tools are placeholders.

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

- OAuth callback fails: confirm the Shopify app allows `http://127.0.0.1:3456/auth/callback`; if OAuth reports a different canonical `.myshopify.com` domain than `--store`, use the stored canonical config domain for Admin API validation.
- MCP host cannot start: run `pnpm run build` and confirm the config path points to `packages/mcp/dist/server.js`.
- Setup check fails: rerun `setup`, `auth`, or `pnpm run build` based on the failed check. `setup-check` is local-only and should keep `fetchCalls: 0`.
- Missing token diagnostics: rerun `auth`; do not paste the generated token anywhere.
- Read tool returns missing input: provide a handle, Shopify ID, order number, email, or tracking reference.
- Execute is blocked: confirm read-only mode is disabled only for a development-store test, required write scopes are granted, the stored preview record is available, `confirmed: true` is present, and the `executeRequest` values were not changed.
- Preview expired or disappeared: create a new preview. MCP defaults persist safe preview records locally, but missing, corrupt, expired, or mismatched records still fail closed.

## Current capabilities

Read tools:

```text
shopify.capabilities.check
order.find
order.get
customer.find
tracking.get
product.get
inventory.lookup
inventory.locationLookup
```

Preview tools:

```text
product.create.preview
product.update.preview
product.media.update.preview
product.importFromUserUrl.preview
inventory.setQuantity.preview
inventory.adjustQuantity.preview
inventory.moveQuantity.preview
page.create.preview
collection.create.preview
```

Real execute tools:

```text
page.create.execute
product.create.execute
product.update.execute
collection.create.execute
inventory.setQuantity.execute
inventory.adjustQuantity.execute
inventory.moveQuantity.execute
```

Placeholder execute tools:

```text
product.media.update.execute
product.importFromUserUrl.execute
customer.updateAddress.execute
tracking.update.execute
refund.execute
bulk.execute
theme.apply
theme.rollback
```

## Not available yet

- npm/npx package install as the primary route.
- Product update execute beyond basic fields, explicit variant price updates, explicit variant creation, explicit option creation, explicit option delete, explicit option reorder, explicit option rename, explicit option value rename, explicit option value add, and explicit option value delete.
- Production-store write automation.
- Rule-based/smart collection create, collection publishing, refund, tracking, customer, bulk, theme, media, inventory beyond explicit lookup, single-item quantity set, and single-item quantity adjustment, metafields, publications, translations, and other advanced execute implementations.
- Automated live Shopify tests.
