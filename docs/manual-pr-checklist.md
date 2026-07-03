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
- Review execute tools for read-only, preview, confirmation, and audit behavior.
- Review capability or auth changes for token redaction and mocked tests only.
- Merge manually only after local validation and reviewer approval.
