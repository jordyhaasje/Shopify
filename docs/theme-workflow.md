# Theme Workflow

Theme work is currently a preview-first planning surface. The runtime does not apply theme file changes yet.

## Current Runtime Tools

`theme.reference.analyze` records a safe analysis plan for a user-provided Shopify reference URL. It does not fetch the URL, capture screenshots, inspect rendered HTML/CSS, read private Liquid, or copy protected source.

`theme.section.generate` creates an original section plan from user-provided context and optional reference information. It is code-generation planning, not a Shopify write.

`theme.preview` prepares a preview record for a generated section plan or theme file diff. It is binding material for future review and must not be treated as permission to write files.

`theme.apply` is a fail-closed execute placeholder. It requires read-only mode disabled, explicit confirmation, an active stored `theme.preview` binding, matching target/tool/hash values, and matching reviewed payload hash before it can return `not_implemented`. It must never audit `success` in the current runtime.

`theme.rollback` is preview-only. It can plan what would be restored from a rollback snapshot or audit entry, but no rollback execute tool is exposed.

## Future Write Boundary

Any future theme write route must be implemented as a separate focused roadmap item with mocked tests and updated docs. Future work must preserve:

- read-only default;
- preview before execute;
- stored preview binding;
- explicit confirmation;
- write-scope or route preflight before any fetch or file mutation;
- safe rollback evidence;
- no raw theme access tokens, upload targets, private Liquid from external stores, or raw Shopify responses in output or audit logs.

Possible future write routes include GraphQL theme file mutations, a REST Asset API fallback, or Shopify CLI with a Theme Access token. Until such a route is implemented, theme tools are planning-only and `theme.apply` remains a placeholder.
