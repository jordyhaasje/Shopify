# Tool Contracts

These are the intended V1 Shopify Store Agent MCP tool contracts. The current implementation includes real read-only Admin GraphQL tools and structured catalog/content preview tools. Execute/write tools remain fail-closed placeholders; real Shopify write API behavior will be added in later PRs.

## Global Write Contract

Every write tool has the same safety requirements:

- Required input: explicit Shopify IDs, user-provided product data, user-provided URLs, CSV rows, image references, order numbers, customer emails, or other user-supplied targets.
- Preview output: a structured summary of what would change, target identifiers, warnings, and an audit entry.
- Preview status: `ok`, `missing_input`, or `validation_error`. Missing input and validation errors are audited as `blocked`; successful previews are audited as `success`.
- Execute requirements: writes enabled, matching preview ID or equivalent reviewed input, explicit confirmation, and required Shopify capability/scope.
- Confirmation requirement: the execute tool must receive explicit confirmation from the user or host.
- Audit requirement: preview and execute attempts must be written to the audit log with tool name, target, mode, summary, and result.
- Failure behavior: fail closed, do not partially continue silently, return a clear error, and leave enough audit context for review.

Structured catalog/content preview tools return `ok`, `status`, `previewId`, `summary`, `target`, `proposedChanges`, `warnings`, `requiredConfirmationForExecute`, and `auditContext`. The output intentionally summarizes large user payloads and redacts secret-looking values instead of echoing raw full inputs.

Current execute tools are placeholders. After read-only and confirmation checks pass, placeholder execute tools return `ok: false`, `implemented: false`, `status: "not_implemented"`, and `placeholder: true`. They must not be interpreted as successful Shopify writes, and their audit entries use `result: "not_implemented"` rather than `success`.

The agent must never autonomously search for products. Users provide the product data, source URL, CSV, images, or IDs.

## Capability

### `shopify.capabilities.check`

Required input: store config location or environment-based config.

Output: store URL, API version, read-only mode, whether Admin API and Theme Access tokens are configured, local capability flags, diagnostics, and setup recommendations. Tokens are never returned.

Default behavior is local-only. If called with `{ "live": true }` and an Admin API token is configured, it may run a minimal Admin GraphQL shop identity query. It must not fetch orders, customers, products, or other sensitive store data.

Failure behavior: return a diagnostic result where possible; throw only for invalid local configuration.

## Products

### `product.get`

Required input: explicit product ID or handle.

Output: minimal product summary with ID, title, handle, status, vendor, and product type. This is read-only and must not return raw product nodes or variant/media dumps.

### `product.create.preview`

Required input: user-provided title and product fields. Optional variants, images, collections, SEO fields, and metafields.

Preview output: product creation plan, target summary, variant/media counts, missing-field warnings, confirmation requirement, preview ID, and audit entry. This tool does not call Shopify or perform mutations.

### `product.create.execute`

Required input: preview ID or reviewed product payload and confirmation.

Execute requirements: `write_products`, writes enabled, explicit confirmation.

### `product.update.preview`

Required input: explicit product ID or handle plus user-provided changes.

Preview output: before/after summary for supplied fields such as title, description, price, variants, media, status, and metadata. Before values are `unknown` unless an existing product summary is supplied separately or read-only enrichment is explicitly requested.

Read enrichment: when the caller supplies an explicit `productId`, `id`, or `handle` and sets `enrichExistingProduct: true`, the MCP runtime may use the read-only `product.get` path to fetch a minimal product summary for before-values. It must not use a loose search query, must not autonomously discover products, and must not fetch when `existingProduct` or `existingProductSummary` is already supplied. If read enrichment fails, the preview remains usable with a warning and `before: "unknown"`. No raw product node, variants, media, or other dumps are returned.

This tool does not perform Shopify mutations.

### `product.update.execute`

Required input: preview ID or reviewed update payload and confirmation.

Execute requirements: `write_products`, writes enabled, explicit confirmation.

### `product.media.update.preview`

Required input: explicit product ID or handle and user-provided media files, URLs, alt text, ordering, or delete instructions.

Preview output: media add/update/delete/reorder plan and delete-review warnings. This tool does not call Shopify or perform mutations.

### `product.media.update.execute`

Required input: preview ID or reviewed media plan and confirmation.

Execute requirements: `write_products` and possibly `write_files`, writes enabled, explicit confirmation.

### `product.importFromUserUrl.preview`

Required input: user-provided Shopify URL and explicit instruction about what may be imported or rewritten.

Preview output: safe import/rewrite plan, original-content guidance from public rendered-page or user-provided signals, URL summary, and warnings.

Failure behavior: do not bypass private code or protected content. Current behavior does not fetch, scrape, or verify the URL; it only plans from the user-provided URL and explicit user instructions. It must not copy private Liquid, protected source code, or private assets.

### `product.importFromUserUrl.execute`

Required input: preview ID, final reviewed product payload, and confirmation.

Execute requirements: relevant product/media scopes, writes enabled, explicit confirmation.

## Orders And Customers

### `order.find`

Required input: user-provided order number, customer email, Shopify ID, or other explicit query.

Output: matching order candidates with minimal necessary data, including Shopify IDs, order names, status summaries, customer identifier summary, totals, and tracking summaries. This read tool is implemented with Admin GraphQL and must not return raw order nodes or full address data.

### `order.get`

Required input: explicit order ID.

Output: minimal order details allowed by scopes and Shopify permissions. This read tool is implemented with Admin GraphQL and intentionally avoids raw order dumps.

### `customer.find`

Required input: user-provided email, name, phone, or Shopify ID.

Output: matching customer candidates with minimal necessary data, including Shopify ID, display name, email, and order count. This read tool is implemented with Admin GraphQL and does not return addresses.

### `customer.updateAddress.preview`

Required input: explicit customer ID/address ID and user-provided address changes.

Preview output: before/after address summary and validation warnings.

### `customer.updateAddress.execute`

Required input: preview ID or reviewed address payload and confirmation.

Execute requirements: `write_customers`, writes enabled, explicit confirmation.

## Refunds

### `refund.preview`

Required input: explicit order ID, refund lines or amounts, shipping amount if applicable, reason, and currency context where needed.

Preview output: calculated refund plan, idempotency key, warnings, and audit entry.

### `refund.execute`

Required input: preview ID or idempotency key, reviewed refund payload, and confirmation.

Execute requirements: refund write capability, writes enabled, explicit confirmation.

Failure behavior: use idempotency and return Shopify user errors without retrying unsafe duplicates.

## Tracking And Fulfillment

### `tracking.get`

Required input: explicit order ID, fulfillment order ID, fulfillment ID, or tracking number.

Output: tracking company, number, URL, fulfillment status, and order identifier where available. This read tool is implemented with Admin GraphQL and returns `matches: []` when no tracking is found.

### `tracking.update.preview`

Required input: explicit fulfillment target plus user-provided tracking company, number, and URL.

Preview output: before/after tracking summary and provider warnings.

### `tracking.update.execute`

Required input: preview ID or reviewed tracking payload and confirmation.

Execute requirements: relevant fulfillment scopes, writes enabled, explicit confirmation.

## Pages And Collections

### `page.create.preview`

Required input: user-provided title, body/content, handle, SEO fields, and publish preference.

Preview output: page creation summary, content summary, SEO/publish plan, warnings, preview ID, and audit entry. This tool does not call Shopify or perform mutations.

### `page.create.execute`

Required input: preview ID or reviewed page payload and confirmation.

Execute requirements: `write_content`, writes enabled, explicit confirmation.

### `collection.create.preview`

Required input: user-provided title and either explicit product IDs or explicit collection rules.

Preview output: collection plan, explicit products/rules summary, warnings, preview ID, and audit entry. This tool requires either explicit product IDs or explicit rules and does not call Shopify or perform mutations.

### `collection.create.execute`

Required input: preview ID or reviewed collection payload and confirmation.

Execute requirements: `write_products`, writes enabled, explicit confirmation.

## Bulk

### `bulk.preview`

Required input: user-provided CSV rows, JSON changes, explicit IDs, or reviewed batch instructions.

Preview output: row-level diff, validation failures, skipped rows, warnings, and audit entry.

### `bulk.execute`

Required input: preview ID or reviewed batch payload and confirmation.

Execute requirements: all required workflow scopes, writes enabled, explicit confirmation.

Failure behavior: fail closed before execution when validation errors exist; if partial execution becomes supported later, report exact completed/failed rows.

### `bulk.status`

Required input: bulk operation ID or audit ID.

Output: operation status, completed count, failed count, warnings, and result location where available.

## Themes

### `theme.reference.analyze`

Required input: user-provided Shopify reference URL.

Output: public rendered-page analysis, layout/component observations, and implementation constraints.

Failure behavior: do not claim access to private Liquid source from another store.

### `theme.section.generate`

Required input: section name, target theme context, optional analyzed reference, copy, images, and settings.

Output: generated section file plan and settings schema summary.

### `theme.preview`

Required input: generated section plan or theme file diff.

Preview output: preview ID, file diff summary, target theme, rollback snapshot reference, and audit entry.

### `theme.apply`

Required input: preview ID and confirmation.

Execute requirements: write-capable theme route, writes enabled, explicit confirmation.

Failure behavior: do not apply without preview ID; fail closed if theme route is unavailable.

### `theme.rollback`

Required input: rollback snapshot ID or audit entry ID.

Preview output: files that would be restored and warnings.

Execute requirements: confirmation and write-capable theme route if rollback execute is added.

## Runtime Naming Status

The runtime MCP tool registry exposes the final V1 names documented here.

No legacy aliases are exposed for the earlier placeholder names such as `product.create`, `product.update`, `order.lookup`, `tracking.update`, `theme.analyzeReference`, or `theme.generateSection`.
