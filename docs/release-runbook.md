# Release Runbook

Use this runbook for release readiness and future npm publishing. Publishing is a manual release action, not an automated test path.

## Release Boundaries

- Do not publish unless there is explicit approval for the exact version and packages.
- Do not add `.github/workflows` for this phase.
- Do not publish from a dirty worktree or an unmerged feature branch.
- Do not include Shopify tokens, OAuth client secrets, Theme Access tokens, raw Shopify responses, raw reviewed payloads, customer/order data, or production product data in release notes, PRs, issues, package files, screenshots, or logs.
- Do not run automated live Shopify tests as part of publishing.
- Keep `pnpm run smoke:local` local/no-write with `fetchCalls: 0`.

## Packages

The intended npm packages are:

- `@shopify-store-agent/core`
- `shopify-store-agent-mcp`
- `shopify-store-agent`

Publish order, when publishing is approved:

1. `@shopify-store-agent/core`
2. `shopify-store-agent-mcp`
3. `shopify-store-agent`

## Preconditions

Before a release PR or publish attempt:

- `main` is current locally with `git checkout main` and `git pull --ff-only`.
- The package version bump, if any, is already reviewed and merged.
- The latest manual development-store E2E result is recorded with safe evidence only, or the release explicitly records why it was skipped.
- Any Shopify app credentials or OAuth secrets that appeared in screenshots, chat, issues, PRs, logs, or docs have been rotated before release.
- npm access is available for all package names.
- `npm whoami` succeeds for the publishing account.
- npm 2FA, if enabled, is handled interactively. Do not paste npm tokens into config files, docs, chat, or PRs.

## Local Release Gate

Run from a clean `main` checkout:

```bash
pnpm install --frozen-lockfile
pnpm run lint
pnpm run typecheck
pnpm test
pnpm run build
pnpm run smoke:local
pnpm run pack:check
```

The gate passes only when:

- all commands pass,
- `pnpm run smoke:local` reports `fetchCalls: 0`,
- `pnpm run pack:check` is dry-run only,
- package contents are limited to intended `dist` files and `package.json`,
- no package tarballs remain in the repo,
- no workflow, live-test, secret, raw Shopify response, raw reviewed payload, or customer/order data is introduced.

## Publish

Only after explicit publish approval and a passing local release gate:

```bash
pnpm --filter @shopify-store-agent/core publish --access public
pnpm --filter shopify-store-agent-mcp publish --access public
pnpm --filter shopify-store-agent publish --access public
```

If publish fails after one package is published, stop and record the exact safe failure summary. Do not retry with changed package contents outside a reviewed release PR.

## Post-Publish Verification

After publishing:

```bash
npm view @shopify-store-agent/core version
npm view shopify-store-agent-mcp version
npm view shopify-store-agent version
```

Then test the published CLI in a temporary directory with local/no-write smoke only:

```bash
mkdir -p /tmp/shopify-store-agent-release-check
cd /tmp/shopify-store-agent-release-check
npm init -y
npm install shopify-store-agent
npx shopify-store-agent smoke --dry-run
```

Post-publish verification must not run live Shopify writes. If a bad package is published, prefer publishing a corrected patch version or `npm deprecate` with a safe message over relying on unpublish behavior.

## Release Evidence

Record safe release evidence in the release PR or issue:

- package versions,
- merge SHA used for publishing,
- local validation command results,
- `smoke:local` `fetchCalls: 0`,
- `pack:check` dry-run result,
- manual dev-store E2E status or explicit skip reason,
- post-publish `npm view` versions,
- confirmation that no workflows, live automated tests, package secrets, raw Shopify responses, raw reviewed payloads, customer/order data, or production product data were added.
