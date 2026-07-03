# Shopify Store Agent Bootstrap Skill

Use this skill when a user wants to install or operate Shopify Store Agent in an AI host.

## Purpose

Help a non-technical merchant configure the Shopify Store Agent CLI and MCP server.

## Setup Flow

1. Run the setup wizard:

   ```bash
   npx shopify-store-agent setup
   ```

2. Ask the user for their Shopify store URL.
3. Guide them to create or provide an Admin API token through Shopify Dev Dashboard or Shopify CLI.
4. Ask whether they want theme/section editing. If yes, guide them to add a Theme Access token.
5. Add the generated MCP snippet to the current AI host.
6. Restart the host if needed.

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
