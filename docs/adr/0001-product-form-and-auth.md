# ADR 0001: Product Form And Auth

## Status

Accepted.

## Decision

Shopify Store Agent is built as a local-first MCP server, CLI wizard, and bootstrap skill package. It is not a Shopify App Store app, not an embedded Shopify Admin app, and not a merchant-facing Shopify application.

## Context

The target user works inside an AI host such as Codex, Claude Code, Cursor, or another MCP-compatible harness. The host can combine this Shopify MCP with separate email MCP servers to support store operations and customer-service workflows.

## Local OAuth

Local OAuth exists only as an install/auth mechanism for the MCP/CLI package. The CLI starts a local callback server, receives the Shopify OAuth callback, validates state and HMAC, exchanges the code, and stores the resulting token locally.

If OAuth is used, it must remain scoped to local setup for the user's own store/app credentials.

## Manual Admin API Token Alternative

Manual Admin API token setup remains supported because early testers and technical users may prefer Shopify's custom-app token flow, because OAuth setup can be inconvenient during development, and because the project should not depend on a shared public OAuth app for V1.

## GitHub Install

The current GitHub install path is temporary while the npm package is unpublished. It is useful for early testing and review, but it is not the intended final setup path.

## Package-Distributed Setup

The intended package-distributed setup route is:

```bash
npx shopify-store-agent setup
```

The CLI setup/auth/check foundation already exists for the GitHub-local route. Future package publishing should expose the same reviewed behavior through npm/npx rather than changing the product form or safety model.

## Safety Default

V1 defaults to read-only mode unless writes are explicitly enabled by the user. Risky write operations require preview or dry-run output plus explicit confirmation before execution.

## Review Model

The current review model is local validation plus manual PR review and manual merge.

Use:

```bash
pnpm run lint
pnpm run typecheck
pnpm test
pnpm run build
pnpm run smoke:local
```

GitHub Actions is intentionally not active until the GitHub account issue is resolved.

## Future OAuth Warning

If a shared or public OAuth app is ever used, token lifecycle, refresh-token handling, storage, revocation, rotation, install ownership, and incident response must be designed explicitly before release.
