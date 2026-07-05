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
4. The user asks the AI host in ordinary store language to read Shopify data, create a preview, or prepare a reviewed change. The host maps that request to safe tools and asks for missing exact targets when needed.
5. The AI host creates a safe preview.
6. The user reviews and explicitly approves the preview.
7. The AI host executes only through the matching execute tool with strict stored preview binding and `confirmed: true`.
8. Output and audit entries stay safe, compact, and free of secrets, raw Shopify nodes, raw reviewed payloads, and large dumps.

## Current MVP Status

- GitHub-local install is the primary working route.
- Local OAuth-first setup is documented and implemented, with hidden interactive client-secret entry and manual token fallback still supported.
- Setup generates MCP snippets for Codex, Claude Code, Cursor, and generic MCP-compatible hosts.
- Setup guidance now tells AI hosts to support ordinary store-language prompts while still asking for exact targets before tool calls when needed.
- Setup output includes safe starter prompts that users can paste into an AI host after MCP configuration.
- A local `setup-check` command verifies config presence, local token presence, read-only onboarding mode, safe MCP snippets, local build path, starter prompts, and `fetchCalls: 0` before users troubleshoot an AI host connection.
- Read tools are implemented for explicit inputs, including read-only inventory lookup helpers for explicit inventory item IDs, variant IDs, SKUs, location IDs, location names, or location queries.
- Preview tools are implemented for product, page, collection, import, media, inventory transfer, and related planning surfaces.
- `page.create.execute` is implemented.
- `product.create.execute` is implemented.
- Minimal `product.update.execute` is implemented for basic product fields, explicit variant price updates, explicit variant creation, explicit option creation, explicit option delete, explicit option reorder, explicit option rename, explicit option value rename, explicit option value add, and explicit option value delete only. Basic fields cover title, description/descriptionHtml, vendor, product type, status, and tags. Variant price updates require product ID plus explicit variant IDs and prices. Variant creation requires product ID plus explicit option values, with optional price and SKU. Option creation requires product ID plus explicit option names and values. Option delete requires product ID plus explicit option IDs and uses `productOptionsDelete` with `NON_DESTRUCTIVE`. Option reorder requires product ID plus explicit option IDs or names in the desired order and uses `productOptionsReorder`. Option rename requires product ID plus explicit option ID and new option name. Option value rename requires product ID plus explicit option ID, option value ID, and new value name. Option value add requires product ID plus explicit option ID and new value names. Option value delete requires product ID plus explicit option ID and option value IDs. Option create, option rename, option value rename, option value add, and option value delete use `LEAVE_AS_IS` to avoid automatic variant expansion. These update shapes cannot be mixed in one execute call.
- Minimal `collection.create.execute` is implemented for custom collections with title, optional handle, and explicit product IDs only.
- Minimal `inventory.setQuantity.execute` is implemented for one explicit inventory item ID, one explicit location ID, quantity name `available`, a non-negative integer quantity, an explicit reason, stored preview binding, `write_inventory` preflight, and compare-and-set by default.
- Minimal `inventory.adjustQuantity.execute` is implemented for one explicit inventory item ID, one explicit location ID, quantity name `available`, a non-zero integer delta, an explicit reason, stored preview binding, and `write_inventory` preflight.
- Minimal `inventory.moveQuantity.execute` is implemented for one explicit inventory item ID, one explicit location ID, one positive integer quantity, supported source and destination quantity names, an explicit reason, stored preview binding, and `write_inventory` preflight.
- Minimal `inventory.transfer.execute` is implemented for one explicit inventory item ID, one source location ID, one destination location ID, one positive integer quantity, an explicit reason, stored preview binding, and local preflight requiring both `write_inventory_transfers` and `read_inventory_transfers`. It creates a draft Shopify inventory transfer only.
- Minimal `inventory.transfer.markReady.execute` is implemented for one explicit inventory transfer ID, stored preview binding, and local preflight requiring both `write_inventory_transfers` and `read_inventory_transfers`. It marks a draft transfer ready to ship only.
- Minimal `inventory.transfer.cancel.execute` is implemented for one explicit inventory transfer ID, stored preview binding, and local preflight requiring both `write_inventory_transfers` and `read_inventory_transfers`. It cancels one transfer only.
- Minimal `inventory.lookup` is implemented as a read-only helper for explicit inventory item ID, variant ID, or SKU lookups. It returns compact inventory item, variant, location, and quantity summaries to help users prepare reviewed inventory previews.
- Minimal `inventory.locationLookup` is implemented as a read-only helper for explicit location ID, location name, or location query lookups. It returns compact location summaries to help users prepare reviewed inventory previews and future location workflows.
- A product media/update execute expansion plan exists, with media execute still intentionally not implemented.
- Safe preview records persist locally across MCP server restarts while preserving strict stored preview binding.
- Safe audit entries persist locally across MCP server restarts in an append-only JSONL file.
- npm/npx package metadata is prepared, locally pack-checkable, and covered by a manual release runbook, but packages are not published.
- A compact user quickstart exists for AI coding harness users.
- Local dev-store E2E config preflight exists to verify the expected store, config path, token presence, granted scopes, and write-mode state before any manual live write run.
- Manual development-store E2E validation has been run once against a development store with safe evidence recorded in the PR. The flow covered local validation, OAuth setup, live-safe capability check, preview-bound page create, preview-bound product create, preview-bound basic-field product update, negative execute checks, audit/output safety review, and read-only config restoration.
- Local smoke validation exists and remains local/no-write with `fetchCalls: 0`.

## Near-Term Roadmap

- Keep this product goal and roadmap document current as shipped capabilities change.
- Publish packages only after explicit approval.
- Before package publishing, follow the release runbook and record safe release evidence.

## Later Roadmap

- Inventory beyond explicit single-item quantity set, single-item adjustment, single-location state move, basic inventory lookup, basic location lookup, draft transfer create, transfer mark-ready, and transfer cancel, including bulk inventory, richer transfer lifecycle actions such as ship/receive, and richer location workflows.
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
