# Installation

Shopify Store Agent is designed for non-technical merchants who use an AI host that supports MCP, such as Codex, Claude Code, Cursor, or a compatible desktop harness.

## Recommended Setup

The intended npm setup command is:

```bash
npx shopify-store-agent setup
```

For the current GitHub-only phase, use the GitHub install flow:

```bash
git clone https://github.com/jordyhaasje/Shopify.git
cd Shopify
pnpm install
pnpm run build
pnpm --filter shopify-store-agent exec shopify-store-agent auth --store your-store.myshopify.com
```

The wizard asks for:

- Shopify store URL.
- Shopify app client ID.
- Shopify app client secret.
- Whether the MCP should start in read-only mode.

The OAuth flow generates and stores an offline Admin API access token locally. Tokens are never printed back in config snippets.

Before running OAuth, add this redirect URL in the Shopify Dev Dashboard app:

```text
http://127.0.0.1:3456/auth/callback
```

## Email

This project does not include an email MCP. Users should connect their existing Gmail, Outlook, IMAP, or helpdesk MCP in the same AI host. The host can then combine email context with Shopify tools.

Example:

```text
Look at the latest email from this customer and check the Shopify order status.
```

The AI host should use the email MCP to read the email and this Shopify MCP to look up the order.
