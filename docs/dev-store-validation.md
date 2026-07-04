# Dev Store Validation

Use this checklist before testing Shopify Store Agent against a development store. Do not use a customer production store for first validation. For the full manual MVP flow, including setup, MCP host connection, previews, `page.create.execute`, `product.create.execute`, `product.update.execute`, `collection.create.execute`, negative tests, and audit checks, see [dev-store-e2e-runbook.md](dev-store-e2e-runbook.md).

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
- Do not request write scopes for read, preview, setup, or smoke validation. For limited write tests, use only a development store and the minimum write scope needed for that execute path: `write_content` or `write_online_store_pages` for `page.create.execute`, and `write_products` for `product.create.execute`, basic-field, explicit-variant-price, explicit-variant-create, explicit-option-create, explicit-option-rename, explicit-option-value-rename, or explicit-option-value-add `product.update.execute`, or custom explicit-product `collection.create.execute`. Read-only mode must be explicitly disabled for each deliberate write test.
- Run setup and review the generated MCP host snippet.
- Confirm snippets point to a local config path, use the local `node /absolute/path/to/Shopify/packages/mcp/dist/server.js` command in the current GitHub-only phase, and do not print raw tokens.
- Remember that npm/npx snippets are a future package-published route.
- Before live write E2E, run `pnpm --filter shopify-store-agent run e2e-preflight -- --store your-store.myshopify.com --config /absolute/path/to/config.json --required-scopes "read_products,read_content,read_online_store_pages,write_products,write_content" --require-write-enabled` and confirm the local-only preflight passes with `no_fetch: true`.

## Manual Validation

When documenting a manual run, use the evidence format in [dev-store-e2e-runbook.md](dev-store-e2e-runbook.md). Keep the record in the relevant PR or issue unless the result becomes durable product documentation. Record pass/fail/skipped status and safe summaries only; do not paste tokens, raw Shopify responses, raw reviewed payloads, config files, customer data, order data, or production product data.

- Run `shopify.capabilities.check` in local mode first.
- Test one read tool with explicit user-provided input.
- Test one catalog/content preview tool.
- Confirm the preview store receives a record.
- Test an execute placeholder with invalid binding and confirm `blocked`.
- Test an execute placeholder with valid stored binding and confirm `not_implemented`.
- Confirm execute placeholders never audit `success`.
- If testing `page.create.execute`, create a `page.create.preview`, review the stored binding payload, then run execute only with `confirmed: true`, matching target/tool/hash values, local granted scopes showing `write_content` or `write_online_store_pages`, and read-only mode disabled.
- If testing `product.create.execute`, create a `product.create.preview`, review the stored binding payload, then run execute only with `confirmed: true`, matching target/tool/hash values, local granted scopes showing `write_products`, and read-only mode disabled. Confirm the mutation is limited to product create with title, description/body HTML summary, vendor, product type, status, and tags only.
- If testing `product.update.execute`, create a `product.update.preview` that includes a safe product ID, review the stored binding payload, then run execute only with `confirmed: true`, matching target/tool/hash values, local granted scopes showing `write_products`, and read-only mode disabled. Confirm the mutation is limited to one supported shape: `productUpdate` with title, description/descriptionHtml, vendor, product type, status, and tags; `productVariantsBulkUpdate` with explicit variant IDs and prices; `productVariantsBulkCreate` with explicit option values and optional price/SKU; `productOptionsCreate` with explicit option names and values using `LEAVE_AS_IS`; `productOptionUpdate` with explicit option ID and new name using `LEAVE_AS_IS`; `productOptionUpdate` with explicit option ID, option value ID, and new value name using `LEAVE_AS_IS`; or `productOptionUpdate` with explicit option ID and new value names using `LEAVE_AS_IS`. Confirm mixed update-shape previews fail closed before fetch.
- If testing `collection.create.execute`, create a `collection.create.preview` with explicit product IDs, review the stored binding payload, then run execute only with `confirmed: true`, matching target/tool/hash values, local granted scopes showing `write_products`, and read-only mode disabled. Confirm the mutation is limited to custom collection create with title, optional handle, and explicit product IDs only.
- Confirm missing or unknown local write scopes block before any Shopify fetch.
- Confirm successful page create performs only the page create mutation followed by verification of the created page ID.
- Confirm successful product create performs only the product create mutation and does not create variants, inventory, media, collections, metafields, publications, translations, updates, deletes, or bulk operations.
- Confirm successful product update performs only the expected narrow mutation: `productUpdate` for basic fields, `productVariantsBulkUpdate` for explicit variant price updates, `productVariantsBulkCreate` for explicit variant creation, `productOptionsCreate` for explicit option creation with `LEAVE_AS_IS`, `productOptionUpdate` for explicit option rename with `LEAVE_AS_IS`, `productOptionUpdate` for explicit option value rename with `LEAVE_AS_IS`, or `productOptionUpdate` for explicit option value add with `LEAVE_AS_IS`. Confirm it does not delete option values, reorder/delete options, update inventory, media, collections, metafields, SEO, publications, translations, deletes, or bulk operations. Confirm handle-only previews fail closed unless a safe product ID is present in the stored preview.
- Confirm successful collection create performs only the collection create mutation and does not create smart/rule-based collections, publish the collection, update SEO, update metafields, upload media/images, update navigation, discover products, or run bulk operations. Confirm rule-based collection previews fail closed at execute.
- Confirm all execute tools except `page.create.execute`, `product.create.execute`, `product.update.execute`, and `collection.create.execute` still remain placeholders.
- Review the audit log for safe targets and no raw payload dumps.

## Safety

- Confirm local smoke, setup, read, preview, invalid execute binding, and placeholder execute checks perform no writes or mutations.
- Confirm any deliberate write test is limited to `page.create.execute`, `product.create.execute`, basic-field, explicit-variant-price, explicit-variant-create, explicit-option-create, explicit-option-rename, explicit-option-value-rename, or explicit-option-value-add `product.update.execute`, or custom explicit-product `collection.create.execute` in a development store.
- Confirm no raw Admin API tokens, OAuth client secrets, Theme Access tokens, customer data, order data, or product dumps appear in logs.
- Keep read-only mode enabled except for explicit reviewed `page.create.execute`, `product.create.execute`, basic-field, explicit-variant-price, explicit-variant-create, explicit-option-create, explicit-option-rename, explicit-option-value-rename, or explicit-option-value-add `product.update.execute`, or custom explicit-product `collection.create.execute` development-store tests.
- Remember that the MCP default context persists safe preview records locally. Missing, corrupt, expired, or mismatched preview records still fail closed; create a new preview when in doubt.
