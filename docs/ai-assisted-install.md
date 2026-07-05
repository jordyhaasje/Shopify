# AI-Assisted Install

Use this prompt in Codex, Claude Code, Cursor, OpenCode, or another MCP-compatible AI coding host when you want the AI to guide the local GitHub install.

```text
Here is the repo: https://github.com/jordyhaasje/Shopify

Help me install Shopify Store Agent locally, safely configure it read-only, connect my Shopify store, add the MCP config to my AI app, run setup-check, and test my first Shopify prompt.

Important constraints:
- Do not publish anything to npm.
- Use the GitHub/local build route for now.
- Keep read-only mode enabled for normal onboarding.
- Never print or paste Admin API tokens, OAuth client secrets, Theme Access tokens, or full token-bearing config.
- Use placeholders like your-store.myshopify.com in shared docs or examples.
- Ask me before any command that needs my local credentials.
- Help me add http://127.0.0.1:3456/auth/callback to my Shopify app before OAuth.
- After setup, help me place the generated MCP snippet for my host and restart or reload that host.
- Run setup-check before the first AI-host prompt.
```

The AI can clone, install dependencies, build, run local validation, generate the host-specific MCP snippet, and explain the next step. You still need to create or choose the Shopify app, add the callback URL, provide the client ID and client secret locally, approve the browser install flow, place or review the host config, restart the host, and run the first test prompt.

Current host targets:

- `codex`
- `claude-code`
- `cursor`
- `opencode`
- `generic`

Example setup command after the repo is installed and built:

```bash
pnpm --filter shopify-store-agent run setup -- --store your-store.myshopify.com --auth oauth --host codex
```

Use `--host opencode`, `--host claude-code`, `--host cursor`, or `--host generic` for another AI app. Use `--host all` when you want every supported snippet.
