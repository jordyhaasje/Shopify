# Temporary GitHub Install Flow

Until the packages are published to npm, users install Shopify Store Agent from GitHub with help from their coding harness. This document is temporary and should be replaced by the future `npx shopify-store-agent setup` flow once package publishing is ready.

```bash
git clone https://github.com/jordyhaasje/Shopify.git
cd Shopify
pnpm install
pnpm run build
pnpm --filter shopify-store-agent run setup -- --store your-store.myshopify.com
```

The generated MCP snippets should point to the local build:

```text
node /absolute/path/to/Shopify/packages/mcp/dist/server.js
```

Use `auth` for the real local OAuth browser flow:

```bash
pnpm --filter shopify-store-agent run auth -- \
  --store your-store.myshopify.com \
  --client-id your-client-id \
  --client-secret your-client-secret
```

The `auth` command starts a temporary local callback server at:

```text
http://127.0.0.1:3456/auth/callback
```

Add that exact URL to the app's allowed redirect URLs in the Shopify Dev Dashboard before running OAuth.

The CLI prints the Shopify install URL. After the user approves the app, Shopify redirects back to the local callback, the CLI validates `state` and HMAC, exchanges the code for an offline Admin API token, and saves config locally at:

```text
~/.shopify-store-agent/config.json
```

The token must never be committed to GitHub or pasted into chat.

Manual Admin API token setup remains supported as a fallback. The npm/npx MCP command is a future route and should not be treated as the primary working path while packages are unpublished.

GitHub Actions is not used for validation in this phase. Run local validation commands from the repository root.
