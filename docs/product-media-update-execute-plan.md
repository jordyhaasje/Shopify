# Product Media And Update Execute Plan

This plan records the intended expansion path for product update and media execute work. It is planning only. It does not make any new execute tool real.

## Sources Checked

- Shopify Admin GraphQL `productUpdate`: https://shopify.dev/docs/api/admin-graphql/latest/mutations/productUpdate
- Shopify Admin GraphQL `productCreateMedia`: https://shopify.dev/docs/api/admin-graphql/latest/mutations/productCreateMedia
- Shopify Admin GraphQL `fileCreate`: https://shopify.dev/docs/api/admin-graphql/latest/mutations/fileCreate
- Shopify Admin GraphQL `fileUpdate`: https://shopify.dev/docs/api/admin-graphql/latest/mutations/fileUpdate
- Shopify Admin GraphQL `productSet`: https://shopify.dev/docs/api/admin-graphql/latest/mutations/productSet

Key planning notes from the current Shopify docs:

- `productUpdate` requires `write_products` and supports adding new product media through its `media` argument.
- `productCreateMedia` and `productDeleteMedia` are deprecated in the current Admin GraphQL docs, so new implementation work should not choose them by default.
- File workflows may require `write_files`, `write_themes`, or `write_images`, and file processing can be asynchronous.
- `productSet` is a broader multi-operation product mutation and should not be introduced as a narrow media/update execute shortcut.

## Current Shipped Boundary

`product.update.execute` is intentionally minimal. It supports only basic product fields from a stored `product.update.preview`:

- title
- description/descriptionHtml
- vendor
- product type
- status
- tags

It also supports explicit variant price updates when the stored preview contains a product ID plus explicit variant IDs and non-negative prices, explicit variant creation when the stored preview contains a product ID plus explicit option values with optional price/SKU, explicit option creation when the stored preview contains a product ID plus option names and values, explicit option delete when the stored preview contains a product ID plus option IDs, explicit option rename when the stored preview contains a product ID plus option ID and new option name, explicit option value rename when the stored preview contains a product ID plus option ID, option value ID, and new value name, explicit option value add when the stored preview contains a product ID plus option ID and new value names, and explicit option value delete when the stored preview contains a product ID plus option ID and option value IDs. These use `productVariantsBulkUpdate`, `productVariantsBulkCreate`, `productOptionsCreate` with `LEAVE_AS_IS`, `productOptionsDelete` with `NON_DESTRUCTIVE`, and `productOptionUpdate` with `LEAVE_AS_IS` respectively, and must not be mixed with basic product field updates or each other in the same execute call.

It must continue to ignore loose execute-only input, require a safe product ID, require stored preview binding and explicit confirmation, locally preflight `write_products`, and return only safe summaries.

`product.media.update.execute` remains a fail-closed placeholder.

## Expansion Sequence

### 1. Keep Basic Product Update Separate

Do not silently add media, SEO, inventory, metafields, publications, translations, or collection changes to the existing product update path.

Any future expansion of `product.update.execute` must be a separate roadmap item with focused tests and docs. The existing basic-field, explicit-variant-price, explicit-variant-create, explicit-option-create, explicit-option-delete, explicit-option-reorder, explicit-option-rename, explicit-option-value-rename, explicit-option-value-add, and explicit-option-value-delete mutations should remain easy to review and reason about.

### 2. First Media Execute Candidate: Add New Product Media

The smallest likely media execute implementation is adding new media to an explicit product ID through `productUpdate(product:, media:)`.

Allowed initial inputs should be limited to values already captured in a stored `product.media.update.preview`:

- explicit product ID
- one or more user-provided media URLs or staged upload URLs
- explicit media content type
- optional alt text

Required safety gates:

- read-only mode disabled
- stored `product.media.update.preview` binding
- `confirmed: true`
- matching target/tool/hash values
- reviewed payload hash recomputed from the stored preview content
- local `write_products` preflight before fetch
- no loose execute input as source of truth
- safe output containing only product ID and bounded media status summaries

Not in the first media execute:

- delete media
- reorder media
- variant-media attachment
- staged upload orchestration
- file library create/update/delete
- media replacement
- product discovery
- bulk media operations

### 3. File Workflow Comes Later

If media workflows need staged uploads or Files API records, implement them separately after the URL-based media add path is proven.

That future work must explicitly handle:

- additional local write-scope preflight for the exact required file scope
- asynchronous file processing status
- safe polling or a separate read-only status tool, if needed
- no raw upload targets, authorization data, or response bodies in output

### 4. Deletes And Reorders Require A Separate Review

Deleting, replacing, or reordering media can break storefront presentation. Treat those as higher-risk write flows with separate preview wording, explicit destructive warnings, and their own tests.

## Required Tests Before Any Implementation

Any future media/update execute PR must include mocked tests for:

- read-only blocks before fetch
- missing or unknown required local write scopes block before fetch
- missing confirmation blocks before fetch
- missing/expired/mismatched stored preview blocks before fetch
- loose execute fields are ignored
- unsupported preview actions fail closed
- Shopify `userErrors` are safe and audit as `blocked`
- network/API failures audit as `failed`
- success audits `success` only after the expected Shopify mutation succeeds
- output does not include raw reviewed payloads, raw Shopify nodes, secrets, media dumps, or unrelated execute input

`pnpm run smoke:local` must remain local/no-write and continue to report `fetchCalls: 0`.
