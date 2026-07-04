# Manual PR Checklist

GitHub Actions is not active for this phase. Use this checklist before manual review or merge.

- Confirm the PR is scoped to the stated task.
- Confirm no `.github/workflows` files are added.
- Confirm no secrets, tokens, real customer data, or real order data appear in code, docs, tests, or logs.
- Run local validation:

```bash
pnpm run lint
pnpm run typecheck
pnpm test
pnpm run build
```

- Review changed docs for product-boundary drift.
- Review read-tool audit behavior: successful read, not found, and multiple matches use `success`; missing input uses `blocked`; Shopify/API/invalid response uses `failed`.
- Review preview-tool audit behavior: successful previews use `success`; missing input and validation errors use `blocked`.
- Confirm preview output summarizes large payloads, redacts secret-looking values, and does not autonomously fetch products or call Shopify write APIs.
- Review local preview-store behavior when changed: stored previews are safe/summarized, hash output is deterministic, TTL expiry fails closed, and no raw reviewed payloads are returned.
- For optional preview read enrichment, confirm it is explicit opt-in, uses only explicit IDs/handles, returns minimal summaries, treats read failures as warnings, and performs no mutations.
- Review execute tools for read-only, preview binding, confirmation, and audit behavior.
- Confirm execute placeholders require preview ID plus reviewed payload/context; missing, expired, invalid, or mismatched binding uses `blocked`, and valid placeholders use `not_implemented`, never `success`.
- For `page.create.execute` changes, confirm it is blocked by read-only mode, requires a valid stored `page.create.preview` binding, locally preflights `write_content` or `write_online_store_pages`, calls Shopify only after binding and scope preflight succeed, verifies by created page ID only after create success, returns safe Shopify `userErrors`, audits success only after a successful page create, and never returns raw reviewed payloads or raw Shopify nodes.
- For `product.create.execute` changes, confirm it is blocked by read-only mode, requires a valid stored `product.create.preview` binding, locally preflights `write_products`, calls Shopify only after binding and scope preflight succeed, performs only the product create mutation, supports only title, description/body HTML summary, vendor, product type, status, and tags, returns a safe created product summary, audits success only after a successful product create, and never returns raw reviewed payloads or raw Shopify nodes.
- Review capability or auth changes for token redaction and mocked tests only.
- Review setup wizard changes for read-only defaults, OAuth auth read-only default scopes, explicit handling of requested `write_` scopes, local-only config storage, safe capability checks, host snippets without raw secrets, and no Shopify write-scope requirement for read/preview setup.
- Review smoke validation changes for local/mocked defaults, no default fetches, no writes or mutations, preview-store coverage, and execute placeholders auditing `blocked` or `not_implemented` but never `success`.
- Merge manually only after local validation and reviewer approval.
