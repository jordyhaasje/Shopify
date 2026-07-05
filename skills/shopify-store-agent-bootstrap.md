# Shopify Store Agent Bootstrap Skill

Use this skill when a user wants to install or operate Shopify Store Agent in an AI host.

## Purpose

Help a non-technical merchant configure the Shopify Store Agent CLI and MCP server.

## Setup Flow

1. Install from GitHub while the project is not yet published to npm:

   ```bash
   git clone https://github.com/jordyhaasje/Shopify.git
   cd Shopify
   pnpm install
   pnpm run build
   ```

2. Ask the user to provide their Shopify store URL, OAuth client ID, and OAuth client secret through local environment variables or the CLI's hidden prompt. Do not ask them to paste secrets into chat, docs, PRs, screenshots, or logs.

3. Confirm the Shopify Dev Dashboard app has this redirect URL:

   ```text
   http://127.0.0.1:3456/auth/callback
   ```

4. Run the real local OAuth browser flow:

   ```bash
   pnpm --filter shopify-store-agent run auth -- \
     --store "$SHOPIFY_STORE" \
     --client-id "$SHOPIFY_CLIENT_ID" \
     --client-secret "$SHOPIFY_CLIENT_SECRET"
   ```

5. Generate local MCP snippets and first prompts:

   ```bash
   pnpm --filter shopify-store-agent run setup -- --store "$SHOPIFY_STORE" --auth oauth
   ```

6. Check local onboarding before troubleshooting the AI host:

   ```bash
   pnpm --filter shopify-store-agent run setup-check -- --store "$SHOPIFY_STORE"
   ```

   `setup-check` is local-only and should report `fetchCalls: 0`.

7. Add the generated MCP snippet to the current AI host.
8. Restart or reload the host if needed.

## Operating Rules

- Do not autonomously search for products.
- Use only products, URLs, CSV files, images, customer emails, order numbers, or Shopify IDs supplied by the user.
- Use preview tools before writes.
- Never execute refunds, tracking changes, customer address updates, bulk edits, or theme applies without explicit confirmation.
- For customer-service tasks, use the user's existing email MCP and Shopify Store Agent MCP together.

## Theme Rules

- External reference URLs are visual/function references.
- Do not claim to fetch, inspect, or copy private Liquid code from another store.
- Treat theme tools as planning-only in the current runtime.
- `theme.apply` is a fail-closed placeholder and must not be described as live apply support.
- `theme.rollback` is preview-only; no rollback execute tool is exposed.
