# Tool Contracts

These are the intended V1 Shopify Store Agent MCP tool contracts. The current implementation includes real read-only Admin GraphQL tools, structured catalog/content preview tools, a local preview store, and five limited real write tools: `page.create.execute`, `product.create.execute`, `product.update.execute`, `collection.create.execute`, and `inventory.setQuantity.execute`. All other execute/write tools remain fail-closed placeholders.

## Global Write Contract

Every write tool has the same safety requirements:

- Required input: explicit Shopify IDs, user-provided product data, user-provided URLs, CSV rows, image references, order numbers, customer emails, or other user-supplied targets.
- Preview output: a structured summary of what would change, target identifiers, warnings, and an audit entry.
- Preview status: `ok`, `missing_input`, or `validation_error`. Missing input and validation errors are audited as `blocked`; successful previews are audited as `success`.
- Execute requirements: writes enabled, preview binding context, matching preview ID or equivalent reviewed input, explicit confirmation, and required Shopify capability/scope.
- Confirmation requirement: the execute tool must receive explicit confirmation from the user or host, but confirmation alone is insufficient.
- Preview binding requirement: execute input must include a `previewId` and reviewed payload/context that can be checked against the expected preview tool, target, and future preview/review hashes. Missing or mismatched binding must fail closed.
- Audit requirement: preview and execute attempts must be written to the audit log with tool name, target, mode, summary, and result.
- Failure behavior: fail closed, do not partially continue silently, return a clear error, and leave enough audit context for review.

The MCP default context persists audit entries to local append-only JSONL. The default path is `audit.jsonl` beside the configured local config file, with `SHOPIFY_STORE_AGENT_AUDIT_LOG` and config `auditLogPath` available as local overrides. Audit entries are evidence metadata only; they must stay compact and must not contain secrets, raw Shopify response nodes, raw reviewed payloads, or customer/order dumps.

Structured catalog/content preview tools return `ok`, `status`, `previewId`, `summary`, `target`, `proposedChanges`, `warnings`, `requiredConfirmationForExecute`, and `auditContext`. The output intentionally summarizes large user payloads and redacts secret-looking values instead of echoing raw full inputs.

Implemented write previews also return `executeRequest` as an AI-host UX helper. For `product.create.preview`, it points to `product.create.execute`; for `page.create.preview`, it points to `page.create.execute`; for `collection.create.preview`, it points to `collection.create.execute`; for `inventory.setQuantity.preview`, it points to `inventory.setQuantity.execute`. The helper contains the execute tool name, expected preview tool, preview ID, target, preview hash, safe reviewed payload, reviewed changes hash, and confirmation requirement. It is only a prepared request for review. It must not be treated as auto-execute, must not be submitted without explicit user approval, and does not bypass stored-preview validation.

Preview tools may also return local binding metadata such as `previewHash` and `binding`. Runtime preview results are stored in a local preview store with safe summarized content, `createdAt`, `expiresAt`, status, and deterministic hashes. The MCP default context persists these safe records to `previews.json` beside the configured local config file, or to `SHOPIFY_STORE_AGENT_PREVIEW_STORE` when that override is set.

`previewId` identifies one saved preview event and is not derived from the content hash. Saving identical preview content twice produces separate preview IDs. `previewHash` is computed from canonicalized safe preview content. Equivalent objects with different key order hash the same way, while changing the tool, target, or proposed changes changes the hash. `reviewedChangesHash` is the corresponding hash for a reviewed payload. Stored-preview verification recomputes the hash from the actual `reviewedPayload`; callers cannot make arbitrary payloads valid by copying `previewHash` into `reviewedChangesHash`. These hashes are binding material for future execute verification, not proof that a write occurred.

Stored previews expire by TTL. Missing, expired, invalid, or mismatched stored preview records must fail closed before any future write path. Store output, persisted records, and audit context must not include raw reviewed payloads, raw Shopify nodes, secrets, or oversized user content.

Persistent preview storage is only binding material. It is not proof that a write happened, does not bypass explicit confirmation, and does not make loose execute input trusted. If the preview file is missing, corrupt, expired, or mismatched, execute fails closed and the user must create a new preview.

Except for `page.create.execute`, `product.create.execute`, `product.update.execute`, `collection.create.execute`, and `inventory.setQuantity.execute`, current execute tools are placeholders. Placeholder preview tools do not present their execute paths as implemented Shopify writes. After read-only and preview-binding checks pass, placeholder execute tools return `ok: false`, `implemented: false`, `status: "not_implemented"`, and `placeholder: true`. They must not be interpreted as successful Shopify writes, and their audit entries use `result: "not_implemented"` rather than `success`. Missing confirmation, missing preview ID, missing reviewed payload, or binding mismatch is audited as `blocked` and must not expose raw reviewed payloads.

`page.create.execute` is implemented as the first narrow production-write foundation. It may call only the Shopify Admin GraphQL page create mutation, and only after read-only mode is disabled, local granted scopes include `write_content` or `write_online_store_pages`, a matching stored `page.create.preview` record exists, the record is active, `confirmed: true` is present, target/tool/hash binding matches, and the actual `reviewedPayload` hashes back to the stored preview. It uses the stored/reviewed preview content as the source of truth, not unrelated loose execute input. Shopify remains the ultimate scope enforcement layer, but the agent fails closed locally when known granted scopes are missing or unknown. Shopify `userErrors` are returned safely and audited as `blocked`; network/API/unexpected errors are audited as `failed`; successful mocked or live page creation is the only execute path that may audit `success`.

`product.create.execute` is implemented as the second narrow production-write foundation. It may call only the Shopify Admin GraphQL product create mutation, and only after read-only mode is disabled, local granted scopes include `write_products`, a matching stored `product.create.preview` record exists, the record is active, `confirmed: true` is present, target/tool/hash binding matches, and the actual `reviewedPayload` hashes back to the stored preview. It uses stored/reviewed preview content as the source of truth and ignores unrelated loose execute input. It supports only minimal product fields from the preview: title, description/body HTML summary, vendor, product type, status, and tags. It does not implement variants, inventory, media/files/images, collections, metafields, SEO bulk changes, publications/channels, translations, delete, or bulk operations. Missing or unknown local write scope blocks before fetch. Shopify `userErrors` are returned safely and audited as `blocked`; network/API/unexpected errors are audited as `failed`; successful mocked or live product creation is the only product-create path that may audit `success`.

`product.update.execute` is implemented as the third narrow production-write foundation. It may call only one narrow Shopify Admin GraphQL product update operation per reviewed preview, and only after read-only mode is disabled, local granted scopes include `write_products`, a matching stored `product.update.preview` record exists, the record is active, `confirmed: true` is present, target/tool/hash binding matches, and the actual `reviewedPayload` hashes back to the stored preview. It uses the stored preview record as the source of truth and ignores unrelated loose execute input. It supports basic product fields from the stored reviewed preview (title, description/descriptionHtml mapped to `descriptionHtml`, vendor, product type, status, and tags), explicit variant price updates from a stored preview with product ID, variant IDs, and non-negative prices, explicit variant creation from a stored preview with product ID, option values, and optional price/SKU, explicit option creation from a stored preview with product ID, option names, and option values, explicit option delete from a stored preview with product ID and option IDs, explicit option reorder from a stored preview with product ID and option IDs or names in the desired order, explicit option rename from a stored preview with product ID, option ID, and new option name, explicit option value rename from a stored preview with product ID, option ID, option value ID, and new value name, explicit option value add from a stored preview with product ID, option ID, and new value names, or explicit option value delete from a stored preview with product ID, option ID, and option value IDs. Basic product fields use `productUpdate`; variant price updates use `productVariantsBulkUpdate`; variant creation uses `productVariantsBulkCreate`; option creation uses `productOptionsCreate` with `LEAVE_AS_IS`; option delete uses `productOptionsDelete` with `NON_DESTRUCTIVE`; option reorder uses `productOptionsReorder`; option rename, option value rename, option value add, and option value delete use `productOptionUpdate` with `LEAVE_AS_IS`. Mixed update-shape previews fail closed before fetch to avoid partial multi-mutation writes. Handle-only previews fail closed unless the stored preview contains a safe product ID. It does not implement inventory, media/files/images, collections, metafields, SEO, publications/channels, translations, delete, or bulk operations. Missing or unknown local write scope blocks before fetch. Shopify `userErrors` are returned safely and audited as `blocked`; network/API/unexpected errors are audited as `failed`; successful mocked or live product update is the only product-update path that may audit `success`.

`collection.create.execute` is implemented as the fourth narrow production-write foundation. It may call only the Shopify Admin GraphQL collection create mutation, and only after read-only mode is disabled, local granted scopes include `write_products`, a matching stored `collection.create.preview` record exists, the record is active, `confirmed: true` is present, target/tool/hash binding matches, and the actual `reviewedPayload` hashes back to the stored preview. It uses the stored preview record as the source of truth and ignores unrelated loose execute input. It supports only custom collection creation from the stored reviewed preview: title, optional handle, and explicit product IDs. Rule-based or smart collection previews fail closed. It does not implement publishing, SEO, metafields, collection media/images, collection update/delete, navigation, product discovery, or bulk operations. Missing or unknown local write scope blocks before fetch. Shopify `userErrors` are returned safely and audited as `blocked`; network/API/unexpected errors are audited as `failed`; successful mocked or live collection creation is the only collection-create path that may audit `success`.

`inventory.setQuantity.execute` is implemented as the fifth narrow production-write foundation. It may call only the Shopify Admin GraphQL `inventorySetQuantities` mutation, and only after read-only mode is disabled, local granted scopes include `write_inventory`, a matching stored `inventory.setQuantity.preview` record exists, the record is active, `confirmed: true` is present, target/tool/hash binding matches, and the actual `reviewedPayload` hashes back to the stored preview. It uses the stored preview record as the source of truth and ignores unrelated loose execute input. It supports only one explicit inventory item ID, one explicit location ID, quantity name `available`, a non-negative integer quantity, an explicit reason, optional reference document URI, and compare-and-set through `compareQuantity` unless `ignoreCompareQuantity: true` was explicitly reviewed. It does not discover inventory items or locations from products, handles, SKUs, or names, and it does not implement bulk inventory, inventory moves, generic adjustments, product updates, or location management. Missing or unknown local write scope blocks before fetch. Shopify `userErrors` are returned safely and audited as `blocked`; network/API/unexpected errors are audited as `failed`; successful mocked or live inventory quantity set is the only inventory-set path that may audit `success`.

The agent must never autonomously search for products. Users provide the product data, source URL, CSV, images, or IDs.

For the manual development-store validation sequence, see [dev-store-e2e-runbook.md](dev-store-e2e-runbook.md). Automated tests remain mocked-only; development-store writes are manual E2E checks.

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

The preview output includes `executeRequest` for `product.create.execute`. This helper is built from the stored, sanitized preview record and exists only to reduce manual copying during user review. The caller must still add or preserve explicit `confirmed: true` only after user approval, and execute validation still recomputes hashes from the actual reviewed payload.

### `product.create.execute`

Required input: stored `product.create.preview` `previewId`, `confirmed: true`, reviewed payload, expected preview tool, target, `previewHash`, and `reviewedChangesHash`.

Execute requirements: `write_products`, read-only mode disabled, explicit confirmation, active stored preview, matching target/tool/hash binding, and reviewed payload hash matching the stored preview. If local granted scopes are known and `write_products` is missing, execution is blocked before fetch. If local granted scopes are unknown, execution also fails closed before fetch. The mutation payload is limited to reviewed product creation fields: title, description/body HTML summary, vendor, product type, status, and tags. It does not implement variants, inventory, media/files/images, collections, metafields, SEO bulk changes, publications/channels, translations, delete, or bulk operations.

Output: safe status, created product ID/title/handle/status on success, safe Shopify `userErrors` or diagnostics on failure, and an audit entry. Output must not return raw reviewed payloads, raw Shopify response nodes, tokens, variant/media/collection dumps, or unrelated execute input.

### `product.update.preview`

Required input: explicit product ID or handle plus user-provided changes.

Preview output: before/after summary for supplied fields such as title, description, price, variants, media, status, and metadata. Before values are `unknown` unless an existing product summary is supplied separately or read-only enrichment is explicitly requested.

Read enrichment: when the caller supplies an explicit `productId`, `id`, or `handle` and sets `enrichExistingProduct: true`, the MCP runtime may use the read-only `product.get` path to fetch a minimal product summary for before-values. It must not use a loose search query, must not autonomously discover products, and must not fetch when `existingProduct` or `existingProductSummary` is already supplied. If read enrichment fails, the preview remains usable with a warning and `before: "unknown"`. No raw product node, variants, media, or other dumps are returned.

This tool does not perform Shopify mutations.

### `product.update.execute`

Required input: stored `product.update.preview` `previewId`, `confirmed: true`, reviewed payload, expected preview tool, target, `previewHash`, and `reviewedChangesHash`.

Execute requirements: `write_products`, read-only mode disabled, explicit confirmation, active stored preview, matching target/tool/hash binding, reviewed payload hash matching the stored preview, and a safe product ID in the stored preview. Handle-only previews fail closed unless a safe product ID is present in the stored preview/reviewed payload. The mutation payload is limited to exactly one supported update shape: basic reviewed product update fields (title, description/descriptionHtml mapped to `descriptionHtml`, vendor, product type, status, and tags), explicit variant price updates with variant IDs and non-negative prices, explicit variant creation with option values and optional price/SKU, explicit option creation with option names and values using `LEAVE_AS_IS`, explicit option delete with option IDs using `NON_DESTRUCTIVE`, explicit option reorder with option IDs or names using `productOptionsReorder`, explicit option rename with option ID and new name using `LEAVE_AS_IS`, explicit option value rename with option ID, option value ID, and new value name using `LEAVE_AS_IS`, explicit option value add with option ID and new value names using `LEAVE_AS_IS`, or explicit option value delete with option ID and option value IDs using `LEAVE_AS_IS`. Mixed update-shape previews fail closed before fetch. Loose execute-only fields are ignored and must not become the source of truth.

Output: safe status, updated product ID/title/handle/status, updated variant-price summary, created variant summary, created option summary, deleted option summary, reordered option summary, renamed option summary, renamed option value summary, added option values summary, or deleted option values summary on success, safe Shopify `userErrors` or diagnostics on failure, and an audit entry. Output must not return raw reviewed payloads, raw Shopify response nodes, tokens, descriptions, variant/media/collection/metafield/SEO/inventory dumps, or unrelated execute input.

Not implemented here: inventory, media/files/images, collections, metafields, SEO, publications/channels, translations, delete, bulk, theme, tracking, refund, or customer writes.

### `inventory.setQuantity.preview`

Required input: explicit inventory item ID, explicit location ID, non-negative integer quantity, explicit reason, and either `compareQuantity` or explicit `ignoreCompareQuantity: true`.

Preview output: target inventory item summary, location ID, quantity before/after based on compare quantity, reason, optional reference document URI, warnings when compare quantity checks are explicitly ignored, preview ID, and audit entry. This tool does not call Shopify or perform mutations.

The preview output includes `executeRequest` for `inventory.setQuantity.execute`. This helper is built from the stored, sanitized preview record and exists only to reduce manual copying during user review.

### `inventory.setQuantity.execute`

Required input: stored `inventory.setQuantity.preview` `previewId`, `confirmed: true`, reviewed payload, expected preview tool, target, `previewHash`, and `reviewedChangesHash`.

Execute requirements: `write_inventory`, read-only mode disabled, explicit confirmation, active stored preview, matching target/tool/hash binding, reviewed payload hash matching the stored preview, and safe explicit inventory item and location IDs in the stored preview. The mutation payload is limited to one `inventorySetQuantities` call for quantity name `available`. Loose execute-only fields are ignored and must not become the source of truth.

Output: safe status, inventory item ID, location ID, quantity, compare quantity settings, safe adjustment changes, safe Shopify `userErrors` or diagnostics on failure, and an audit entry. Output must not return raw reviewed payloads, raw Shopify response nodes, tokens, product/variant/location dumps, or unrelated execute input.

Not implemented here: execute-time lookup/discovery, location search by name, inventory moves, generic adjustments, bulk inventory, location management, or product update inventory fields.

### `inventory.lookup`

Required input: exactly one explicit inventory item ID, product variant ID, or SKU. Optional pagination limits may bound SKU matches and inventory levels.

Output: compact inventory item summaries with inventory item ID, SKU, tracked flag, related variant/product identifiers, location IDs/names, available quantity, and other named inventory quantities needed for review. This is read-only and must not return raw Shopify nodes, raw product/variant/location dumps, secrets, or customer/order data.

Behavior: this helper exists to help a user or AI host prepare the exact `inventoryItemId`, `locationId`, and `compareQuantity` needed for `inventory.setQuantity.preview`. It must not perform writes, must not guess products, and must not run during execute as a hidden discovery step. Multiple SKU matches are returned as candidates for user review.

Not implemented here: location search by name, product/handle browsing, inventory adjustments, inventory moves, bulk inventory, or location management.

### `product.media.update.preview`

Required input: explicit product ID or handle and user-provided media files, URLs, alt text, ordering, or delete instructions.

Preview output: media add/update/delete/reorder plan and delete-review warnings. This tool does not call Shopify or perform mutations.

### `product.media.update.execute`

Required input: preview ID or reviewed media plan and confirmation.

Execute requirements: `write_products` and possibly `write_files`, writes enabled, explicit confirmation.

Current status: not implemented. The intended expansion is planned in [product-media-update-execute-plan.md](product-media-update-execute-plan.md). Do not implement media add/delete/reorder, file workflows, or broader `product.update.execute` behavior without a separate scoped roadmap item.

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

The preview output includes `executeRequest` for `page.create.execute`. This helper is built from the stored, sanitized preview record and exists only to reduce manual copying during user review. The caller must still add or preserve explicit `confirmed: true` only after user approval, and execute validation still recomputes hashes from the actual reviewed payload.

### `page.create.execute`

Required input: stored `page.create.preview` `previewId`, `confirmed: true`, reviewed payload, expected preview tool, target, `previewHash`, and `reviewedChangesHash`.

Execute requirements: `write_content` or `write_online_store_pages`, read-only mode disabled, explicit confirmation, active stored preview, matching target/tool/hash binding, and reviewed payload hash matching the stored preview. If local granted scopes are known and neither accepted write scope is present, execution is blocked before fetch. If local granted scopes are unknown, execution also fails closed before fetch. The mutation payload is limited to reviewed page creation fields such as title, body/content summary, handle, publish preference, and template suffix when present in the preview. It does not implement page update/delete, SEO bulk changes, metafields, navigation, media, theme edits, products, or collections.

Output: safe status, created page ID/title/handle on success, safe read-after-write verification by created page ID, safe Shopify `userErrors` or diagnostics on failure, and an audit entry. Verification failures are warnings after create success and do not trigger extra mutations. Output must not return raw reviewed payloads, raw Shopify response nodes, tokens, or unrelated execute input.

### `collection.create.preview`

Required input: user-provided title and either explicit product IDs or explicit collection rules.

Preview output: collection plan, explicit products/rules summary, warnings, preview ID, and audit entry. This tool requires either explicit product IDs or explicit rules and does not call Shopify or perform mutations.

The preview output includes `executeRequest` for `collection.create.execute` when the preview is stored. This helper is built from the stored, sanitized preview record and exists only to reduce manual copying during user review. The caller must still add or preserve explicit `confirmed: true` only after user approval, and execute validation still recomputes hashes from the actual reviewed payload. Rule-based or smart collection previews may be previewed, but execute fails closed because this phase implements only explicit-product custom collection creation.

### `collection.create.execute`

Required input: stored `collection.create.preview` `previewId`, `confirmed: true`, reviewed payload, expected preview tool, target, `previewHash`, and `reviewedChangesHash`.

Execute requirements: `write_products`, read-only mode disabled, explicit confirmation, active stored preview, matching target/tool/hash binding, and reviewed payload hash matching the stored preview. If local granted scopes are known and `write_products` is missing, execution is blocked before fetch. If local granted scopes are unknown, execution also fails closed before fetch. The mutation payload is limited to reviewed custom collection creation fields: title, optional handle, and explicit product IDs from the stored preview. Rule-based or smart collections fail closed and are not executed.

Output: safe status, created collection ID/title/handle on success, safe Shopify `userErrors` or diagnostics on failure, and an audit entry. Output must not return raw reviewed payloads, raw Shopify response nodes, tokens, product dumps, raw collection nodes, or unrelated execute input.

Not implemented here: rule-based or smart collections, publishing, SEO, metafields, media/images, collection update/delete, navigation, product discovery, or bulk operations.

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
