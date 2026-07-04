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
- Do not request write scopes for read, preview, setup, or smoke validation. For the first limited write test, use only a development store and the minimum page-content write scope needed for `page.create.execute`, with read-only mode explicitly disabled for that test.
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
- If testing the first real write path, create a `page.create.preview`, review the stored binding payload, then run `page.create.execute` only with `confirmed: true`, matching target/tool/hash values, and read-only mode disabled.
- Confirm all non-page execute tools still remain placeholders.
- Review the audit log for safe targets and no raw payload dumps.

## Safety

- Confirm local smoke, setup, read, preview, invalid execute binding, and placeholder execute checks perform no writes or mutations.
- Confirm any deliberate write test is limited to `page.create.execute` in a development store.
- Confirm no raw Admin API tokens, OAuth client secrets, Theme Access tokens, customer data, order data, or product dumps appear in logs.
- Keep read-only mode enabled except for the explicit reviewed `page.create.execute` development-store test.
