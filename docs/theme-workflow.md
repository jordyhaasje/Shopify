# Theme And Section Workflow

Theme changes are preview-first.

## Route Selection

The setup wizard capability-tests theme writes and chooses the best route:

1. GraphQL theme file mutations, if available.
2. REST Asset API fallback for individual theme files.
3. Shopify CLI with Theme Access token and minimal file sync.
4. Code generation only, if no write route is available.

## Reference URL Reconstruction

When a user provides a Shopify reference URL, the agent can:

- inspect rendered HTML and CSS;
- detect Shopify section wrappers;
- capture desktop/tablet/mobile screenshots;
- generate an original Liquid section with schema, settings, blocks, CSS, and optional JavaScript;
- preview the generated section before applying it.

The agent cannot read private Liquid files from an external store unless the user has authenticated access to that store.

## Apply Guardrail

`theme.apply` requires:

- a preview ID;
- explicit confirmation;
- write-enabled config;
- an available theme write route.
