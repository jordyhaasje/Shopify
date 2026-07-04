# Product Goal And Roadmap

This is the canonical product goal and implementation roadmap for Shopify Store Agent. Keep it aligned with shipped behavior.

## Product Goal

Shopify Store Agent is a local-first Shopify MCP server and CLI that lets AI coding and workflow hosts safely read Shopify data, prepare reviewed changes, and execute explicitly approved Shopify writes through strict preview binding.

The product should make Shopify work easier inside hosts such as Codex, OpenCode, Claude Code, Cursor, and generic MCP-compatible tools while keeping the user in control of every risky action.

## What This Is Not

- Not a Shopify App Store app.
- Not an embedded Shopify Admin app.
- Not a SaaS dashboard.
- Not an email MCP.
- Not an autonomous scraping agent.
- Not an autonomous write agent.

## Target User Experience

1. The user installs from a GitHub clone today, or from a future npm/npx package after publishing exists.
2. The user connects a Shopify store with local OAuth, with manual Admin API token setup as a fallback.
3. The user adds the Shopify Store Agent MCP server to an AI host.
4. The user asks the AI host to read Shopify data, create a preview, or prepare a reviewed change from explicit user-provided inputs.
5. The AI host creates a safe preview.
6. The user reviews and explicitly approves the preview.
7. The AI host executes only through the matching execute tool with strict stored preview binding and `confirmed: true`.
8. Output and audit entries stay safe, compact, and free of secrets, raw Shopify nodes, raw reviewed payloads, and large dumps.

## Current MVP Status After PR #20

- GitHub-local install is the primary working route.
- Local OAuth-first setup is documented and implemented, with manual token fallback still supported.
- Setup generates MCP snippets for Codex, Claude Code, Cursor, and generic MCP-compatible hosts.
- Read tools are implemented for explicit inputs.
- Preview tools are implemented for product, page, collection, import, media, and related planning surfaces.
- `page.create.execute` is implemented.
- `product.create.execute` is implemented.
- Minimal `product.update.execute` is implemented for basic product fields only: title, description/descriptionHtml, vendor, product type, status, and tags.
- A compact user quickstart exists for AI coding harness users.
- A manual development-store E2E runbook and PR-safe evidence format exist. Live development-store validation has not been claimed unless a future PR or issue records it with safe evidence.
- Local smoke validation exists and remains local/no-write with `fetchCalls: 0`.

## Near-Term Roadmap

- Run and document manual development-store E2E validation with safe evidence from a development or disposable test store.
- Keep this product goal and roadmap document current as shipped capabilities change.
- Implement minimal `collection.create.execute` only when explicitly scoped and reviewed.
- Plan product media/update execute expansion without broadening the existing minimal update path silently.
- Add persistent preview storage while preserving strict stored preview binding.
- Prepare npm/npx packaging so local GitHub install is no longer the only working route.

## Later Roadmap

- Variants.
- Inventory.
- Metafields.
- Publications.
- Translations.
- Refunds.
- Tracking update.
- Customer address update.
- Bulk operations.
- Theme apply/rollback.

## Permanent Safety Constraints

- Read-only by default.
- Preview before execute.
- Stored preview binding.
- Explicit confirmation.
- Write-scope preflight.
- No secrets in code, docs, tests, logs, PRs, screenshots, or chat.
- No raw Shopify dumps.
- No loose execute input as the source of truth.
- No live automated Shopify tests.
- `pnpm run smoke:local` must remain local/no-write and report `fetchCalls: 0`.

## Codex Operating Rules

- Keep PRs small and focused.
- Make one meaningful change per PR.
- Inspect GitHub and the repo before changes.
- Run `pnpm run lint`, `pnpm run typecheck`, `pnpm test`, `pnpm run build`, and `pnpm run smoke:local`.
- Leave PRs open for review unless explicitly told to merge.
- Never broaden write scope silently.
- Never implement adjacent execute tools without explicit instruction.
- Keep docs aligned with implemented tools.
