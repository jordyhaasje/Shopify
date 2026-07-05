# Repository Instructions

## Product Boundary

Shopify Store Agent is a local-first MCP, CLI, and bootstrap skill package for AI coding/workflow hosts such as Codex, Claude Code, Cursor, and other MCP-compatible harnesses.

It is not a Shopify App Store app, not an embedded Shopify Admin app, and not a merchant-facing Shopify application. Any Shopify OAuth support in this repository is only a local install/auth mechanism for the MCP/CLI package.

Manual Admin API token setup must remain supported as an alternative to OAuth.

Existing email MCP servers are used separately by the AI host. Do not build an email MCP in this repository.

## Safety Rules

Users must provide products, URLs, CSV files, images, customer emails, order numbers, or Shopify IDs. The agent must never autonomously search for products.

All risky write operations require a preview or dry-run plus explicit user confirmation before execution.

V1 defaults to read-only mode unless the user explicitly enables writes.

Never commit, print in docs, store in tests, or include in logs real Shopify tokens, OAuth client secrets, customer data, order data, or other secrets.

## Validation

GitHub Actions is not required for this phase and must not be relied on while the GitHub account issue exists. Validate locally with:

```bash
pnpm run lint
pnpm run typecheck
pnpm test
pnpm run build
pnpm run smoke:local
```

PRs are reviewed manually and merged manually.

## Documentation Rules

Durable documentation lives in `docs/`.

Architecture decisions live in `docs/adr/`.

Avoid duplicate planning or status files. Keep planning/status in the relevant PR or issue unless it becomes durable product documentation.

Temporary install documentation must be clearly marked temporary.

## Development Rules

Keep PRs small and focused.

Do not make broad refactors without a clear reason tied to the current task.

Every security, auth, config, or helper change needs focused tests.

Keep implementation aligned with the local-first product boundary and safety rules above.
