# Dev Store E2E Runbook

This runbook is for manual validation of the current Shopify Store Agent MVP against a development store or disposable test store. Do not use a production customer store for first validation.

The goal is to test the current local-first flow end to end:

- Setup and local config.
- MCP host connection.
- Read-only checks.
- Preview tools and local preview storage.
- `page.create.execute`.
- `product.create.execute`.
- Audit and output safety.

## Requirements

- Use a development store or disposable test store.
- Do not use real customer, order, or production product data.
- Keep all credentials local. Never paste tokens, OAuth client secrets, Theme Access tokens, customer data, order data, or raw Shopify responses into docs, PRs, issues, chat, screenshots, or logs.
- Node.js and pnpm are available locally.
- The repository is cloned locally.
- You have local OAuth app credentials for the development store, or a manual Admin API token fallback.
- Setup defaults to read-only mode. Disable read-only only for the deliberate development-store write steps below.
- This runbook is manual. Do not add live automated tests or real dev-store writes to `pnpm run smoke:local`.

## Scopes

Use the smallest scope set for the workflow being tested.

For read and preview validation:

```text
read_products
read_content
read_online_store_pages
```

For `page.create.execute`, add one of:

```text
write_content
```

or:

```text
write_online_store_pages
```

For `product.create.execute`, add:

```text
write_products
```

Setup and OAuth default to read-only scopes. Add write scopes only for development-store write tests, and only with read-only mode explicitly disabled. Local write-scope preflight blocks before fetch when required write scopes are missing or unknown. Shopify remains the ultimate scope enforcement layer.

## Local Validation Before Shopify Connection

Run local validation before connecting a store:

```bash
pnpm install
pnpm run lint
pnpm run typecheck
pnpm test
pnpm run build
pnpm run smoke:local
```

`pnpm run smoke:local` is local/mocked-only. It should not call Shopify, perform writes, or run GraphQL mutations. It should report:

```text
fetchCalls: 0
```

Smoke also checks invalid execute binding as `blocked` and a valid still-placeholder execute path as `not_implemented`.

## Setup

Current GitHub install/setup flow:

```bash
git clone https://github.com/jordyhaasje/Shopify.git
cd Shopify
pnpm install
pnpm run build
pnpm --filter shopify-store-agent run setup -- --store your-store.myshopify.com
```

Setup is for local config, MCP snippets, and guidance. It prints the config path and MCP snippets for Codex, Claude Code, Cursor, and generic MCP-compatible hosts. In the current GitHub-only phase, snippets use the local build with a command like:

```text
node /absolute/path/to/Shopify/packages/mcp/dist/server.js
```

Snippets point to local config and non-secret environment values; they must not include raw Admin API tokens or OAuth client secrets.

For OAuth-first read-only auth, configure the Shopify Dev Dashboard app redirect URL:

```text
http://127.0.0.1:3456/auth/callback
```

Then run:

```bash
pnpm --filter shopify-store-agent run auth -- \
  --store your-store.myshopify.com \
  --client-id "$SHOPIFY_CLIENT_ID" \
  --client-secret "$SHOPIFY_CLIENT_SECRET" \
  --scopes "read_products,read_content,read_online_store_pages"
```

`auth` is the real OAuth browser flow. `setup --auth oauth` only prints guidance and snippets; it does not exchange a token.

Manual Admin API token setup remains available as a fallback:

For a deliberate development-store write test with a manual Admin API token, use read-only off and explicit scopes:

```bash
pnpm --filter shopify-store-agent run setup -- \
  --store your-store.myshopify.com \
  --auth manual \
  --admin-token "$SHOPIFY_ADMIN_TOKEN" \
  --write-enabled \
  --scopes "read_products,read_content,read_online_store_pages,write_products,write_content"
```

Use only the write scope needed for the specific test. For page-only validation, `write_content` or `write_online_store_pages` is enough. For product-create validation, `write_products` is required.

For deliberate OAuth write testing on a development store, run `auth` with write mode and the minimal reviewed scope set:

```bash
pnpm --filter shopify-store-agent run auth -- \
  --store your-store.myshopify.com \
  --client-id "$SHOPIFY_CLIENT_ID" \
  --client-secret "$SHOPIFY_CLIENT_SECRET" \
  --write-enabled \
  --scopes "read_products,read_content,read_online_store_pages,write_products,write_content"
```

Write mode is only for reviewed development-store tests of `page.create.execute` or `product.create.execute`. All other execute tools remain fail-closed placeholders.

## MCP Host Connection

Use the generated Codex, Claude Code, Cursor, or generic MCP host snippet.

- Confirm the snippet points to the intended local config path.
- Confirm the snippet uses `command = "node"` or `"command": "node"` and points to the local `packages/mcp/dist/server.js` build while npm publishing is inactive.
- Do not paste raw tokens directly into host config.
- Start the MCP server locally through the generated command/snippet.
- If you rerun setup, refresh the host snippet or restart the MCP host so it reads the current config.

## Read-Only Sanity Checks

Start with local capability diagnostics:

```text
shopify.capabilities.check
```

Then test read tools only with explicit user-provided identifiers:

```text
product.get
order.find
customer.find
tracking.get
```

Use explicit product IDs or handles, order numbers, customer emails, order IDs, fulfillment IDs, or tracking numbers. Do not ask the agent to autonomously search for products. Do not use production customer data. Outputs should be minimal summaries, not raw Shopify dumps.

## Page Create E2E

1. Run `page.create.preview` with safe test data, for example:

```json
{
  "title": "Store Agent Test Page",
  "body": "<p>Temporary development-store validation page.</p>",
  "handle": "store-agent-test-page",
  "publishPreference": "draft"
}
```

2. Review the preview output:

- `previewId`
- `previewHash`
- `binding`
- `target`
- `proposedChanges`
- `warnings`

3. Confirm read-only mode is explicitly off only for this development-store test.

4. Confirm local granted scopes include `write_content` or `write_online_store_pages`.

5. Run `page.create.execute` with the reviewed binding values:

```json
{
  "previewId": "<previewId from page.create.preview>",
  "confirmed": true,
  "reviewedPayload": "<safe reviewed preview payload>",
  "expectedTool": "page.create.preview",
  "target": "<binding target>",
  "previewHash": "<previewHash>",
  "reviewedChangesHash": "<hash of the actual reviewed payload>"
}
```

Use the reviewed payload produced from the stored safe preview content. Do not substitute a different payload, and do not rely on loose execute-only fields.

6. Confirm:

- The Shopify page is created in the development store.
- Output contains only a safe created page summary.
- Verification uses the created page ID only.
- Audit result is `success` only after create success.
- Output and audit contain no secrets, raw reviewed payload, or full Shopify node.

## Product Create E2E

1. Run `product.create.preview` with minimal safe test data:

```json
{
  "title": "Store Agent Test Product",
  "description": "Temporary development-store validation product.",
  "vendor": "Store Agent Test",
  "productType": "Validation",
  "status": "draft",
  "tags": ["store-agent-test", "temporary"]
}
```

2. Review the preview binding values:

- `previewId`
- `previewHash`
- `binding`
- `target`
- `proposedChanges`
- `warnings`

3. Confirm read-only mode is explicitly off only for this development-store test.

4. Confirm local granted scopes include `write_products`.

5. Run `product.create.execute` with the reviewed binding values:

```json
{
  "previewId": "<previewId from product.create.preview>",
  "confirmed": true,
  "reviewedPayload": "<safe reviewed preview payload>",
  "expectedTool": "product.create.preview",
  "target": "<binding target>",
  "previewHash": "<previewHash>",
  "reviewedChangesHash": "<hash of the actual reviewed payload>"
}
```

Use the stored/reviewed preview content as the source of truth. Unrelated loose execute input must be ignored.

6. Confirm:

- The Shopify product is created in the development store.
- Output contains only a safe product summary: `id`, `title`, `handle`, and `status`.
- No variants, inventory, media/files/images, collections, metafields, SEO bulk fields, publications/channels, translations, product update/delete, or bulk operations are performed.
- Output and audit contain no secrets, raw reviewed payload, or full Shopify node.

## Negative Tests

Run these manually against the development-store setup:

- Read-only mode on: `page.create.execute` and `product.create.execute` return `blocked`.
- Missing `confirmed: true`: execute returns `blocked`.
- Missing `previewId`: execute returns `blocked`.
- Expired preview: execute returns `blocked`.
- Mismatched target, preview hash, reviewed payload, or reviewed changes hash: execute returns `blocked`.
- Missing or unknown write scope: execute returns `blocked` before fetch.
- Unrelated loose execute input is ignored after a valid stored preview binding.
- Non-page and non-product execute tools remain placeholders and return `not_implemented` after valid binding.

Placeholder execute tools are:

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

## Audit And Output Checklist

Confirm:

- No raw Admin API token.
- No OAuth client secret.
- No Theme Access token.
- No raw reviewed payload.
- No full Shopify node.
- No order/customer dump.
- Blocked cases audit `blocked`.
- Placeholder cases audit `not_implemented`.
- Successful `page.create.execute` and `product.create.execute` audit `success` only after Shopify create success.

## Troubleshooting

- Read-only mode is still enabled: rerun setup or update local config for a development-store write test only.
- Granted scopes are missing or unknown: rerun setup/auth with explicit minimal write scopes for the target execute path.
- Preview expired or disappeared: the preview store is in-memory and process-local; create a new preview in the same MCP server process.
- MCP server restarted: create a new preview because stored previews do not persist across restarts.
- Wrong target, hash, or reviewed payload: rerun preview, review the stored preview content, and execute with matching binding values.
- Shopify returns `userErrors`: inspect the safe user error summary and adjust the test input.
- Token lacks scope: update the development-store app/token scopes, reinstall if needed, and refresh local config.
- Wrong store URL: rerun setup for the intended development store.
- MCP host uses an old config/snippet: refresh the host snippet and restart the MCP host.
