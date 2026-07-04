# Dev Store Validation

Use this checklist before testing Shopify Store Agent against a development store. Do not use a customer production store for first validation. For the full manual MVP flow, including setup, MCP host connection, previews, `page.create.execute`, `product.create.execute`, `product.update.execute`, negative tests, and audit checks, see [dev-store-e2e-runbook.md](dev-store-e2e-runbook.md).

## Local Smoke

Run the local smoke validation first:

```bash
pnpm run smoke:local
```

The default smoke path is local/mocked only. It should not make Shopify network calls, should not perform writes, and should not run GraphQL mutations.

Expected local smoke output includes:

```text
fetchCalls: 0
```

Optional live mode is limited to the minimal capability check:

```bash
pnpm --filter shopify-store-agent run smoke -- --live --admin-token "$SHOPIFY_ADMIN_TOKEN"
```

## Setup

- Use a development store or disposable test store.
- Use the current GitHub clone + `pnpm install` + `pnpm run build` route while npm publishing is inactive.
- Prefer local OAuth with the `auth` command when Shopify app client credentials are available; use manual Admin API token setup only as a fallback.
- Treat `setup --auth oauth` as guidance/snippet generation only. It does not run the browser flow or exchange a token.
- Keep setup read-only by default.
- Use read-only Admin API scopes for read and preview validation.
- Do not request write scopes for read, preview, setup, or smoke validation. For limited write tests, use only a development store and the minimum write scope needed for that execute path: `write_content` or `write_online_store_pages` for `page.create.execute`, and `write_products` for `product.create.execute` or basic-field `product.update.execute`. Read-only mode must be explicitly disabled for each deliberate write test.
- Run setup and review the generated MCP host snippet.
- Confirm snippets point to a local config path, use the local `node /absolute/path/to/Shopify/packages/mcp/dist/server.js` command in the current GitHub-only phase, and do not print raw tokens.
- Remember that npm/npx snippets are a future package-published route.

## Manual Validation

- Run `shopify.capabilities.check` in local mode first.
- Test one read tool with explicit user-provided input.
- Test one catalog/content preview tool.
- Confirm the preview store receives a record.
- Test an execute placeholder with invalid binding and confirm `blocked`.
- Test an execute placeholder with valid stored binding and confirm `not_implemented`.
- Confirm execute placeholders never audit `success`.
- If testing `page.create.execute`, create a `page.create.preview`, review the stored binding payload, then run execute only with `confirmed: true`, matching target/tool/hash values, local granted scopes showing `write_content` or `write_online_store_pages`, and read-only mode disabled.
- If testing `product.create.execute`, create a `product.create.preview`, review the stored binding payload, then run execute only with `confirmed: true`, matching target/tool/hash values, local granted scopes showing `write_products`, and read-only mode disabled. Confirm the mutation is limited to product create with title, description/body HTML summary, vendor, product type, status, and tags only.
- If testing `product.update.execute`, create a `product.update.preview` that includes a safe product ID, review the stored binding payload, then run execute only with `confirmed: true`, matching target/tool/hash values, local granted scopes showing `write_products`, and read-only mode disabled. Confirm the mutation is limited to `productUpdate` with title, description/descriptionHtml, vendor, product type, status, and tags only.
- Confirm missing or unknown local write scopes block before any Shopify fetch.
- Confirm successful page create performs only the page create mutation followed by verification of the created page ID.
- Confirm successful product create performs only the product create mutation and does not create variants, inventory, media, collections, metafields, publications, translations, updates, deletes, or bulk operations.
- Confirm successful product update performs only the `productUpdate` mutation and does not update variants, inventory, media, collections, metafields, SEO, publications, translations, deletes, or bulk operations. Confirm handle-only previews fail closed unless a safe product ID is present in the stored preview.
- Confirm all execute tools except `page.create.execute`, `product.create.execute`, and `product.update.execute` still remain placeholders.
- Review the audit log for safe targets and no raw payload dumps.

## Safety

- Confirm local smoke, setup, read, preview, invalid execute binding, and placeholder execute checks perform no writes or mutations.
- Confirm any deliberate write test is limited to `page.create.execute`, `product.create.execute`, or basic-field `product.update.execute` in a development store.
- Confirm no raw Admin API tokens, OAuth client secrets, Theme Access tokens, customer data, order data, or product dumps appear in logs.
- Keep read-only mode enabled except for explicit reviewed `page.create.execute`, `product.create.execute`, or basic-field `product.update.execute` development-store tests.
- Remember that the preview store is in-memory and process-local. If the MCP server restarts, create a new preview before execute.
