# AI Operator Guide

This guide is for users running Shopify Store Agent with Codex, OpenCode, Claude Code, Cursor, or another coding harness that can edit a local repo and connect to MCP servers.

For the shortest first-run path, start with [user-quickstart.md](user-quickstart.md). This guide expands the operator responsibilities and safety boundaries.

## What AI Can Do

- Clone the GitHub repo and inspect the project.
- Install dependencies with `pnpm install`.
- Build and validate locally with `pnpm run lint`, `pnpm run typecheck`, `pnpm test`, `pnpm run build`, and `pnpm run smoke:local`.
- Run setup/auth commands when the user provides local environment variables.
- Help place the generated MCP snippet in the host config.
- Inspect available MCP tools and explain their safety model.
- Accept ordinary store-language requests from the user, map them to safe Shopify Store Agent tools, and ask concise follow-up questions when exact targets are missing.
- Create read-only checks and previews from user-provided inputs.
- Prepare execute payloads from the preview `executeRequest` helper for user review.
- Guide negative tests for read-only mode, missing confirmation, missing preview IDs, mismatched hashes, and missing write scopes.
- Check outputs for secrets, raw Shopify dumps, raw reviewed payloads, and unsafe audit results.

## What The User Must Do

- Provide Shopify app client ID and client secret through local environment variables, not chat or docs.
- Open the OAuth install URL and approve the app in the browser.
- Keep Admin API tokens, OAuth client secrets, Theme Access tokens, screenshots, and local config contents out of chat, docs, PRs, logs, and issue comments.
- Give explicit approval before any real write.
- Use a development store or disposable test store for first write validation before enabling writes on a normal store.

## Natural-Language Operating Model

Users should not need to know MCP tool names, GraphQL IDs, or Shopify handles before asking for help. They can ask for outcomes like "make a draft return-policy page", "update the summer collection", or "check this customer's order". The AI host is responsible for translating that request into tool calls, previews, and follow-up questions.

Keep the distinction sharp:

- Good: ask the user for the missing product link, title, order number, customer email, Shopify ID, handle, CSV, image, or other explicit target before calling a tool.
- Good: use read-only tools to confirm a user-provided target and summarize possible matches.
- Bad: autonomously search or guess which product/customer/order the user meant.
- Bad: execute from loose natural-language instructions without a stored preview, reviewed payload, matching hashes, and explicit approval.

For normal production stores, start with read-only checks and previews. For first write validation, use a development or disposable store. After the user deliberately enables write mode on a normal store, keep the same preview-before-execute and explicit-confirmation rules.

## Current Install Route

The current working route is GitHub clone plus local build. npm publishing is not active yet, so npm/npx should be treated as a future path.

```bash
git clone https://github.com/jordyhaasje/Shopify.git
cd Shopify
pnpm install
pnpm run build
```

Run local validation before connecting a store:

```bash
pnpm run lint
pnpm run typecheck
pnpm test
pnpm run build
pnpm run smoke:local
```

`pnpm run smoke:local` must stay local/no-write and report `fetchCalls: 0`.

## OAuth-First Store Flow

Example store:

```bash
export SHOPIFY_STORE="hazify-apps.myshopify.com"
export SHOPIFY_CLIENT_ID="..."
export SHOPIFY_CLIENT_SECRET="..."
```

Add this redirect URL to the Shopify Dev Dashboard app before running OAuth:

```text
http://127.0.0.1:3456/auth/callback
```

Read-only OAuth:

```bash
pnpm --filter shopify-store-agent run auth -- \
  --store "$SHOPIFY_STORE" \
  --client-id "$SHOPIFY_CLIENT_ID" \
  --client-secret "$SHOPIFY_CLIENT_SECRET" \
  --scopes "read_products,read_content,read_online_store_pages,read_inventory,read_locations"
```

Write-test OAuth for a development store only:

```bash
pnpm --filter shopify-store-agent run auth -- \
  --store "$SHOPIFY_STORE" \
  --client-id "$SHOPIFY_CLIENT_ID" \
  --client-secret "$SHOPIFY_CLIENT_SECRET" \
  --write-enabled \
  --scopes "read_products,read_content,read_online_store_pages,read_inventory,read_locations,write_products,write_content,write_inventory,write_inventory_transfers,read_inventory_transfers"
```

Use write mode only for reviewed development-store tests of `page.create.execute`, `product.create.execute`, basic-field, explicit-variant-price, explicit-variant-create, explicit-option-create, explicit-option-delete, explicit-option-reorder, explicit-option-rename, explicit-option-value-rename, explicit-option-value-add, or explicit-option-value-delete `product.update.execute`, custom explicit-product `collection.create.execute`, explicit single-item `inventory.setQuantity.execute`, explicit single-item `inventory.adjustQuantity.execute`, explicit same-location state `inventory.moveQuantity.execute`, or explicit single-item draft transfer `inventory.transfer.execute`. All other execute tools remain fail-closed placeholders.

`auth` is the real local OAuth browser flow and stores the resulting Admin API token locally. `setup --auth oauth` only prints setup guidance and MCP snippets; it does not exchange a token.

Manual Admin API token setup remains available as a fallback.

## MCP Host Config

After `pnpm run build`, run setup to generate snippets:

```bash
pnpm --filter shopify-store-agent run setup -- --store "$SHOPIFY_STORE" --auth oauth
```

Setup also prints "First AI prompts". Encourage users to start from those prompts instead of requiring MCP tool names, Shopify handles, or GraphQL IDs. The prompts are examples; the host must still choose the correct tool, ask for missing exact targets, and keep preview-before-execute.

After setup/auth, run the local setup check before debugging host behavior:

```bash
pnpm --filter shopify-store-agent run setup-check -- --store "$SHOPIFY_STORE"
```

`setup-check` verifies local config, token presence, read-only onboarding mode, safe MCP snippets, the local MCP server build path, safe starter prompts, and `fetchCalls: 0`. It does not call Shopify and does not prove that a host has reloaded config; restart or reload the MCP host after changing snippets.

In the current GitHub-only route, MCP hosts should use a local node command:

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

For Claude Code, Cursor, and generic MCP hosts, use the equivalent generated JSON snippet. The snippet must use `SHOPIFY_STORE_AGENT_CONFIG` and must not contain Admin API tokens, OAuth client secrets, or Theme Access tokens.

The future npm/npx route can replace the local node command after packages are published.

## Write Safety

Current real write tools:

- `page.create.execute`
- `product.create.execute`
- `product.update.execute` for basic product fields, explicit variant price updates, explicit variant creation, explicit option creation, explicit option delete, explicit option reorder, explicit option rename, explicit option value rename, explicit option value add, or explicit option value delete only
- `collection.create.execute` for custom collections with explicit product IDs only
- `inventory.setQuantity.execute` for one explicit inventory item ID and location ID only
- `inventory.adjustQuantity.execute` for one explicit inventory item ID, location ID, and non-zero delta only
- `inventory.moveQuantity.execute` for one explicit inventory item ID, location ID, positive quantity, and source/destination quantity states only
- `inventory.transfer.execute` for one explicit inventory item ID, source location ID, destination location ID, positive quantity, and draft transfer create only

All other execute tools are placeholders. A real write still requires preview output, stored preview binding, matching target/tool/hash values, matching reviewed payload hash, read-only mode disabled, required local granted scopes, and explicit user confirmation.

`product.create.preview`, `page.create.preview`, `collection.create.preview`, `inventory.setQuantity.preview`, `inventory.adjustQuantity.preview`, `inventory.moveQuantity.preview`, and `inventory.transfer.preview` include an `executeRequest` helper. It contains the matching execute tool, expected preview tool, `previewId`, target, `previewHash`, safe reviewed payload, reviewed changes hash, and confirmation requirement. Use it to prepare the execute call for review, not to run automatically.

For inventory preparation, use `inventory.lookup` only with an explicit inventory item ID, variant ID, or SKU, and use `inventory.locationLookup` only with an explicit location ID, name, or query. Treat multiple matches as candidates for user review, not as permission to guess a target.

Before any real write, the user must review the preview and explicitly approve. The execute call must include `confirmed: true`; without that, execute remains blocked. The helper does not bypass the stored preview, does not weaken hash validation, and does not make placeholder execute tools real writes.
