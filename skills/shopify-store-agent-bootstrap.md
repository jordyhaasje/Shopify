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

2. Confirm the Shopify Dev Dashboard app has this redirect URL:

   ```text
   http://127.0.0.1:3456/auth/callback
   ```

3. Run the OAuth setup wizard:

   ```bash
   pnpm --filter shopify-store-agent exec shopify-store-agent auth --store your-store.myshopify.com
   ```

4. Ask the user for their Shopify store URL, client ID, and client secret.
5. Never display or store secrets in the repository.
6. Add the generated MCP snippet to the current AI host.
7. Restart the host if needed.

## Operating Rules

- Do not autonomously search for products.
- Use only products, URLs, CSV files, images, customer emails, order numbers, or Shopify IDs supplied by the user.
- Use preview tools before writes.
- Never execute refunds, tracking changes, customer address updates, bulk edits, or theme applies without explicit confirmation.
- For customer-service tasks, use the user's existing email MCP and Shopify Store Agent MCP together.

## Theme Rules

- External reference URLs are visual/function references.
- Do not claim to copy private Liquid code from another store.
- Generate original sections and preview them before live apply.
