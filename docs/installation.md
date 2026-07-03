# Installation

Shopify Store Agent is designed for non-technical merchants who use an AI host that supports MCP, such as Codex, Claude Code, Cursor, or a compatible desktop harness.

## Recommended Setup

The intended public setup command is:

```bash
npx shopify-store-agent setup
```

The wizard asks for:

- Shopify store URL.
- Admin API access token.
- Optional Theme Access token.
- Whether the MCP should start in read-only mode.

The wizard then prints MCP config snippets for Codex, Claude Code, and Cursor. Tokens are never printed back in config snippets.

## Email

This project does not include an email MCP. Users should connect their existing Gmail, Outlook, IMAP, or helpdesk MCP in the same AI host. The host can then combine email context with Shopify tools.

Example:

```text
Look at the latest email from this customer and check the Shopify order status.
```

The AI host should use the email MCP to read the email and this Shopify MCP to look up the order.
