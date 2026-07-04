# Dev Store Validation

Use this checklist before testing Shopify Store Agent against a development store. Do not use a customer production store for first validation.

## Local Smoke

Run the local smoke validation first:

```bash
pnpm run smoke:local
```

The default smoke path is local/mocked only. It should not make Shopify network calls, should not perform writes, and should not run GraphQL mutations.

Optional live mode is limited to the minimal capability check:

```bash
pnpm --filter shopify-store-agent run smoke -- --live --admin-token "$SHOPIFY_ADMIN_TOKEN"
```

## Setup

- Use a development store or disposable test store.
- Keep setup read-only by default.
- Use read-only Admin API scopes for read and preview validation.
- Do not request write scopes for read, preview, setup, or smoke validation. For limited write tests, use only a development store and the minimum write scope needed for that execute path: `write_content` or `write_online_store_pages` for `page.create.execute`, and `write_products` for `product.create.execute`. Read-only mode must be explicitly disabled for each deliberate write test.
- Run setup and review the generated MCP host snippet.
- Confirm snippets point to a local config path and do not print raw tokens.

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
- Confirm missing or unknown local write scopes block before any Shopify fetch.
- Confirm successful page create performs only the page create mutation followed by verification of the created page ID.
- Confirm successful product create performs only the product create mutation and does not create variants, inventory, media, collections, metafields, publications, translations, updates, deletes, or bulk operations.
- Confirm all execute tools except `page.create.execute` and `product.create.execute` still remain placeholders.
- Review the audit log for safe targets and no raw payload dumps.

## Safety

- Confirm local smoke, setup, read, preview, invalid execute binding, and placeholder execute checks perform no writes or mutations.
- Confirm any deliberate write test is limited to `page.create.execute` or `product.create.execute` in a development store.
- Confirm no raw Admin API tokens, OAuth client secrets, Theme Access tokens, customer data, order data, or product dumps appear in logs.
- Keep read-only mode enabled except for explicit reviewed `page.create.execute` or `product.create.execute` development-store tests.
