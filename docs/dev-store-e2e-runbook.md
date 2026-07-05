# Dev Store E2E Runbook

This runbook is for manual validation of the current Shopify Store Agent MVP against a development store or disposable test store. Do not use a production customer store for first validation.

For a compact user-facing first run, start with [user-quickstart.md](user-quickstart.md). Use this runbook for fuller manual development-store validation.

The goal is to test the current local-first flow end to end:

- Setup and local config.
- MCP host connection.
- Read-only checks.
- Preview tools and local preview storage.
- `page.create.execute`.
- `product.create.execute`.
- `product.update.execute` for basic fields, explicit variant price updates, explicit variant creation, explicit option creation, explicit option delete, explicit option reorder, explicit option rename, explicit option value rename, explicit option value add, or explicit option value delete only.
- `collection.create.execute` for custom collections with explicit product IDs only.
- `inventory.setQuantity.execute` for one explicit inventory item ID and one explicit location ID only.
- `inventory.adjustQuantity.execute` for one explicit inventory item ID, one explicit location ID, and one non-zero delta only.
- `inventory.moveQuantity.execute` for one explicit inventory item ID, one explicit location ID, and one same-location quantity state move only.
- `inventory.transfer.execute` for one explicit inventory item ID, one source location ID, one destination location ID, and one draft transfer only.
- `inventory.transfer.markReady.execute` for one explicit inventory transfer ID and mark-ready only.
- Audit and output safety.

## Requirements

- Use a development store or disposable test store.
- Do not use real customer, order, or production product data.
- Keep all credentials local. Never paste tokens, OAuth client secrets, Theme Access tokens, customer data, order data, or raw Shopify responses into docs, PRs, issues, chat, screenshots, or logs.
- Node.js and pnpm are available locally.
- The repository is cloned locally.
- You have local OAuth app credentials for the development store, or a manual Admin API token fallback.
- Setup defaults to read-only mode. Disable read-only only for the deliberate development-store write steps below.
- This runbook is manual. Do not add live automated tests or real dev-store writes to `pnpm run smoke:local`.

## Evidence To Record

When a reviewer or maintainer runs this manual validation, record only safe summaries in the PR or issue that requested the run. Do not create a separate status document unless the result becomes durable product documentation.

Use this format:

```text
Manual development-store E2E validation:
- Date:
- Runner:
- Store type: development or disposable test store
- Install route: GitHub local clone
- Auth route: OAuth or manual token
- Local validation: lint/typecheck/test/build/smoke passed
- smoke:local fetchCalls: 0
- MCP host used:
- Read-only checks: passed/failed/skipped
- Preview checks: passed/failed/skipped
- page.create.execute: passed/failed/skipped
- product.create.execute: passed/failed/skipped
- product.update.execute: passed/failed/skipped
- collection.create.execute: passed/failed/skipped
- inventory.setQuantity.execute: passed/failed/skipped
- inventory.adjustQuantity.execute: passed/failed/skipped
- inventory.moveQuantity.execute: passed/failed/skipped
- inventory.transfer.execute: passed/failed/skipped
- inventory.transfer.markReady.execute: passed/failed/skipped
- Negative execute checks: passed/failed/skipped
- Audit/output safety review: passed/failed/skipped
- Cleanup completed:
- Notes:
```

Allowed evidence:

- Tool names and pass/fail/skipped status.
- Safe object identifiers only when needed for cleanup, such as redacted Shopify GIDs ending in the last 4 characters.
- Safe created or updated test titles that contain no customer or production data.
- Safe error summaries and Shopify `userErrors` messages.
- Confirmation that `pnpm run smoke:local` reported `fetchCalls: 0`.

Do not record:

- Admin API tokens, OAuth client secrets, Theme Access tokens, bearer headers, cookies, or authorization URLs containing secrets.
- Raw Shopify GraphQL responses, raw nodes, raw reviewed payloads, or config files.
- Real customer, order, address, email, phone, fulfillment, or production product data.
- Screenshots that show secrets, customer data, raw response bodies, or browser/admin URLs with sensitive query parameters.

## Scopes

Use the smallest scope set for the workflow being tested.

For read and preview validation:

```text
read_products
read_content
read_online_store_pages
```

For `page.create.execute`, add one of:

```text
write_content
```

or:

```text
write_online_store_pages
```

For `product.create.execute`, basic-field, explicit-variant-price, explicit-variant-create, explicit-option-create, explicit-option-delete, explicit-option-reorder, explicit-option-rename, explicit-option-value-rename, explicit-option-value-add, or explicit-option-value-delete `product.update.execute`, or custom explicit-product `collection.create.execute`, add:

```text
write_products
```

For `inventory.setQuantity.execute`, `inventory.adjustQuantity.execute`, or `inventory.moveQuantity.execute`, add:

```text
write_inventory
```

For `inventory.transfer.execute` or `inventory.transfer.markReady.execute`, add both:

```text
write_inventory_transfers
read_inventory_transfers
```

Setup and OAuth default to read-only scopes. Add write scopes only for development-store write tests, and only with read-only mode explicitly disabled. Local write-scope preflight blocks before fetch when required write scopes are missing or unknown. Shopify remains the ultimate scope enforcement layer.

## Local Validation Before Shopify Connection

Run local validation before connecting a store:

```bash
pnpm install
pnpm run lint
pnpm run typecheck
pnpm test
pnpm run build
pnpm run smoke:local
```

`pnpm run smoke:local` is local/mocked-only. It should not call Shopify, perform writes, or run GraphQL mutations. It should report:

```text
fetchCalls: 0
```

Smoke also checks invalid execute binding as `blocked` and a valid still-placeholder execute path as `not_implemented`.

## Setup

Current GitHub install/setup flow:

```bash
git clone https://github.com/jordyhaasje/Shopify.git
cd Shopify
pnpm install
pnpm run build
pnpm --filter shopify-store-agent run setup -- --store your-store.myshopify.com
```

Setup is for local config, MCP snippets, and guidance. It prints the config path and MCP snippets for Codex, Claude Code, Cursor, and generic MCP-compatible hosts. In the current GitHub-only phase, snippets use the local build with a command like:

```text
node /absolute/path/to/Shopify/packages/mcp/dist/server.js
```

Snippets point to local config and non-secret environment values; they must not include raw Admin API tokens or OAuth client secrets.

For OAuth-first read-only auth, configure the Shopify Dev Dashboard app redirect URL:

```text
http://127.0.0.1:3456/auth/callback
```

Then run:

```bash
pnpm --filter shopify-store-agent run auth -- \
  --store your-store.myshopify.com \
  --client-id "$SHOPIFY_CLIENT_ID" \
  --client-secret "$SHOPIFY_CLIENT_SECRET" \
  --scopes "read_products,read_content,read_online_store_pages,read_inventory,read_locations"
```

`auth` is the real OAuth browser flow. `setup --auth oauth` only prints guidance and snippets; it does not exchange a token. When a store has multiple connected domains, Shopify can return the original canonical `.myshopify.com` domain in the OAuth callback even if `--store` used the primary storefront domain. Use the canonical stored config domain for Admin API validation and preflight after OAuth completes.

Manual Admin API token setup remains available as a fallback:

For a deliberate development-store write test with a manual Admin API token, use read-only off and explicit scopes:

```bash
pnpm --filter shopify-store-agent run setup -- \
  --store your-store.myshopify.com \
  --auth manual \
  --admin-token "$SHOPIFY_ADMIN_TOKEN" \
  --write-enabled \
  --scopes "read_products,read_content,read_online_store_pages,read_inventory,read_locations,write_products,write_content,write_inventory,write_inventory_transfers,read_inventory_transfers"
```

Use only the write scope needed for the specific test. For page-only validation, `write_content` or `write_online_store_pages` is enough. For product create, basic-field product update, explicit variant price update, explicit variant creation, explicit option creation, explicit option delete, explicit option reorder, explicit option rename, explicit option value rename, explicit option value add, explicit option value delete, or custom explicit-product collection create validation, `write_products` is required. For explicit single-item inventory quantity set, adjustment, or same-location state move validation, `write_inventory` is required. For explicit draft inventory transfer or mark-ready validation, both `write_inventory_transfers` and `read_inventory_transfers` are required.

For deliberate OAuth write testing on a development store, run `auth` with write mode and the minimal reviewed scope set:

```bash
pnpm --filter shopify-store-agent run auth -- \
  --store your-store.myshopify.com \
  --client-id "$SHOPIFY_CLIENT_ID" \
  --client-secret "$SHOPIFY_CLIENT_SECRET" \
  --write-enabled \
  --scopes "read_products,read_content,read_online_store_pages,read_inventory,read_locations,write_products,write_content,write_inventory,write_inventory_transfers,read_inventory_transfers"
```

Write mode is only for reviewed development-store tests of `page.create.execute`, `product.create.execute`, basic-field, explicit-variant-price, explicit-variant-create, explicit-option-create, explicit-option-delete, explicit-option-reorder, explicit-option-rename, explicit-option-value-rename, explicit-option-value-add, or explicit-option-value-delete `product.update.execute`, custom explicit-product `collection.create.execute`, explicit single-item `inventory.setQuantity.execute`, explicit single-item `inventory.adjustQuantity.execute`, explicit same-location state `inventory.moveQuantity.execute`, explicit single-item draft transfer `inventory.transfer.execute`, or explicit transfer mark-ready `inventory.transfer.markReady.execute`. All other execute tools remain fail-closed placeholders.

## Local E2E Config Preflight

Before any live development-store write step, run a local preflight against the exact config path and expected store. This command does not call Shopify and should report `no_fetch: true`.

```bash
pnpm --filter shopify-store-agent run e2e-preflight -- \
  --store your-store.myshopify.com \
  --config /absolute/path/to/config.json \
  --required-scopes "read_products,read_content,read_online_store_pages,read_inventory,read_locations,write_products,write_content,write_inventory,write_inventory_transfers,read_inventory_transfers" \
  --require-write-enabled
```

The preflight must pass before live write E2E. It fails closed when the config is missing, points at a different store, lacks a local Admin API token, is still read-only while write testing is requested, or lacks required local granted scopes. Shopify can omit a read scope from the granted scope string when the matching write scope is granted, so local preflight treats `write_products`, `write_content`, and similar write scopes as satisfying their paired read checks. Do not continue live E2E with a failed preflight.

## MCP Host Connection

Use the generated Codex, Claude Code, Cursor, or generic MCP host snippet.

- Confirm the snippet points to the intended local config path.
- Confirm the snippet uses `command = "node"` or `"command": "node"` and points to the local `packages/mcp/dist/server.js` build while npm publishing is inactive.
- Do not paste raw tokens directly into host config.
- Start the MCP server locally through the generated command/snippet.
- If you rerun setup, refresh the host snippet or restart the MCP host so it reads the current config.

## Read-Only Sanity Checks

Start with local capability diagnostics:

```text
shopify.capabilities.check
```

Then test read tools only with explicit user-provided identifiers:

```text
product.get
inventory.lookup
inventory.locationLookup
order.find
customer.find
tracking.get
```

Use explicit product IDs or handles, inventory item IDs, variant IDs, SKUs, location IDs, location names, location queries, order numbers, customer emails, order IDs, fulfillment IDs, or tracking numbers. Do not ask the agent to autonomously search for products or guess locations. Do not use production customer data. Outputs should be minimal summaries, not raw Shopify dumps.

## Page Create E2E

1. Run `page.create.preview` with safe test data, for example:

```json
{
  "title": "Store Agent Test Page",
  "body": "<p>Temporary development-store validation page.</p>",
  "handle": "store-agent-test-page",
  "publishPreference": "draft"
}
```

2. Review the preview output:

- `previewId`
- `previewHash`
- `binding`
- `executeRequest`
- `target`
- `proposedChanges`
- `warnings`

`executeRequest` is a convenience helper for the AI host. It is not auto-execute and must not be submitted until the user explicitly approves the reviewed preview.

3. Confirm read-only mode is explicitly off only for this development-store test.

4. Confirm local granted scopes include `write_content` or `write_online_store_pages`.

5. Run `page.create.execute` with the reviewed binding values, either copied from `executeRequest` or assembled manually:

```json
{
  "previewId": "<previewId from page.create.preview>",
  "confirmed": true,
  "reviewedPayload": "<safe reviewed preview payload>",
  "expectedTool": "page.create.preview",
  "target": "<binding target>",
  "previewHash": "<previewHash>",
  "reviewedChangesHash": "<hash of the actual reviewed payload>"
}
```

Use the reviewed payload produced from the stored safe preview content. Do not substitute a different payload, and do not rely on loose execute-only fields.

6. Confirm:

- The Shopify page is created in the development store.
- Output contains only a safe created page summary.
- Verification uses the created page ID only.
- Audit result is `success` only after create success.
- Output and audit contain no secrets, raw reviewed payload, or full Shopify node.

## Product Create E2E

1. Run `product.create.preview` with minimal safe test data:

```json
{
  "title": "Store Agent Test Product",
  "description": "Temporary development-store validation product.",
  "vendor": "Store Agent Test",
  "productType": "Validation",
  "status": "draft",
  "tags": ["store-agent-test", "temporary"]
}
```

2. Review the preview binding values:

- `previewId`
- `previewHash`
- `binding`
- `executeRequest`
- `target`
- `proposedChanges`
- `warnings`

`executeRequest` is a convenience helper for the AI host. It is not auto-execute and must not be submitted until the user explicitly approves the reviewed preview.

3. Confirm read-only mode is explicitly off only for this development-store test.

4. Confirm local granted scopes include `write_products`.

5. Run `product.create.execute` with the reviewed binding values, either copied from `executeRequest` or assembled manually:

```json
{
  "previewId": "<previewId from product.create.preview>",
  "confirmed": true,
  "reviewedPayload": "<safe reviewed preview payload>",
  "expectedTool": "product.create.preview",
  "target": "<binding target>",
  "previewHash": "<previewHash>",
  "reviewedChangesHash": "<hash of the actual reviewed payload>"
}
```

Use the stored/reviewed preview content as the source of truth. Unrelated loose execute input must be ignored.

6. Confirm:

- The Shopify product is created in the development store.
- Output contains only a safe product summary: `id`, `title`, `handle`, and `status`.
- No option reorder, inventory, media/files/images, collections, metafields, SEO bulk fields, publications/channels, translations, delete, or bulk operations are performed.
- Output and audit contain no secrets, raw reviewed payload, or full Shopify node.

## Product Update E2E

Use only a disposable/development product that can be safely changed.

1. Run `product.update.preview` with a safe product ID and one supported update shape only:

```json
{
  "productId": "gid://shopify/Product/<test-product-id>",
  "title": "Store Agent Updated Test Product",
  "description": "Temporary development-store validation update.",
  "vendor": "Store Agent Test",
  "productType": "Validation",
  "status": "draft",
  "tags": ["store-agent-test", "temporary"]
}
```

2. Review the preview binding values:

- `previewId`
- `previewHash`
- `binding`
- `target`
- `proposedChanges`
- `warnings`

`product.update.preview` does not currently return `executeRequest`; assemble the execute call from the stored binding values after explicit user approval.

3. Confirm read-only mode is explicitly off only for this development-store test.

4. Confirm local granted scopes include `write_products`.

5. Run `product.update.execute` with the reviewed binding values:

```json
{
  "previewId": "<previewId from product.update.preview>",
  "confirmed": true,
  "reviewedPayload": "<safe reviewed preview payload>",
  "expectedTool": "product.update.preview",
  "target": "<binding target>",
  "previewHash": "<previewHash>",
  "reviewedChangesHash": "<hash of the actual reviewed payload>"
}
```

Use the stored preview content as the source of truth. Unrelated loose execute input must be ignored. Handle-only previews must fail closed unless the stored preview contains a safe product ID.

6. Confirm:

- The Shopify product basic fields are updated in the development store.
- Output contains only a safe updated product summary: `id`, `title`, `handle`, and `status`.
- No inventory, media/files/images, collections, metafields, SEO, publications/channels, translations, delete, or bulk operations are performed. If validating a variant price update, confirm it uses explicit variant IDs and prices through `productVariantsBulkUpdate`. If validating explicit variant creation, confirm it uses explicit option values and optional price/SKU through `productVariantsBulkCreate`. If validating explicit option creation, confirm it uses explicit option names and values through `productOptionsCreate` with `LEAVE_AS_IS`. If validating explicit option delete, confirm it uses product ID and option IDs through `productOptionsDelete` with `NON_DESTRUCTIVE`. If validating explicit option reorder, confirm it uses product ID and explicit option IDs or names through `productOptionsReorder`. If validating explicit option rename, confirm it uses product ID, option ID, and new option name through `productOptionUpdate` with `LEAVE_AS_IS`. If validating explicit option value rename, confirm it uses product ID, option ID, option value ID, and new value name through `productOptionUpdate` with `LEAVE_AS_IS`. If validating explicit option value add, confirm it uses product ID, option ID, and new value names through `productOptionUpdate` with `LEAVE_AS_IS`. If validating explicit option value delete, confirm it uses product ID, option ID, and option value IDs through `productOptionUpdate` with `LEAVE_AS_IS`. Confirm mixed update-shape previews fail closed before fetch.
- Output and audit contain no secrets, raw reviewed payload, raw descriptions, or full Shopify node.

## Collection Create E2E

Use only disposable/development products and a temporary collection title.

1. Run `collection.create.preview` with safe test data and explicit product IDs:

```json
{
  "title": "Store Agent Test Collection",
  "handle": "store-agent-test-collection",
  "productIds": ["gid://shopify/Product/<test-product-id>"]
}
```

2. Review the preview binding values:

- `previewId`
- `previewHash`
- `binding`
- `executeRequest`
- `target`
- `proposedChanges`
- `warnings`

`executeRequest` is a convenience helper for the AI host. It is not auto-execute and must not be submitted until the user explicitly approves the reviewed preview.

3. Confirm read-only mode is explicitly off only for this development-store test.

4. Confirm local granted scopes include `write_products`.

5. Run `collection.create.execute` with the reviewed binding values:

```json
{
  "previewId": "<previewId from collection.create.preview>",
  "confirmed": true,
  "reviewedPayload": "<safe reviewed preview payload>",
  "expectedTool": "collection.create.preview",
  "target": "<binding target>",
  "previewHash": "<previewHash>",
  "reviewedChangesHash": "<hash of the actual reviewed payload>"
}
```

Use the stored preview content as the source of truth. Unrelated loose execute input must be ignored.

6. Confirm:

- The Shopify collection is created in the development store.
- Output contains only a safe collection summary: `id`, `title`, and `handle`.
- No rule-based or smart collection, publishing, SEO, metafield, media/image, navigation, product discovery, update/delete, or bulk operation is performed.
- Output and audit contain no secrets, raw reviewed payload, raw product dump, or full Shopify node.

## Inventory Set Quantity E2E

Use only a disposable/development inventory item and location that can be safely changed.

1. Optional read-only preparation: run `inventory.lookup` with one explicit inventory item ID, product variant ID, or SKU to collect the test `inventoryItemId`, `locationId`, and current available quantity. Keep only safe pass/fail evidence and compact IDs/quantities; do not record raw Shopify responses or product/location dumps.

2. Run `inventory.setQuantity.preview` with explicit test data:

```json
{
  "inventoryItemId": "gid://shopify/InventoryItem/<test-inventory-item-id>",
  "locationId": "gid://shopify/Location/<test-location-id>",
  "quantity": 8,
  "compareQuantity": 5,
  "reason": "correction",
  "referenceDocumentUri": "gid://store-agent/TestRun/<safe-id>"
}
```

Use `ignoreCompareQuantity: true` only when the reviewer explicitly accepts stale inventory risk.

3. Review the preview binding values and `executeRequest`.

4. Confirm read-only mode is explicitly off only for this development-store test.

5. Confirm local granted scopes include `write_inventory`.

6. Run `inventory.setQuantity.execute` with the reviewed binding values and `confirmed: true`.

7. Confirm:

- The inventory quantity is set only for the explicit inventory item/location pair.
- The mutation is limited to `inventorySetQuantities` with quantity name `available`.
- No product, SKU, inventory item, or location lookup/discovery is performed during execute.
- No bulk inventory, state move, inter-location transfer, product update, or location management operation is performed.
- Output and audit contain no secrets, raw reviewed payload, raw Shopify response, product dump, location dump, or full Shopify node.

## Inventory Adjust Quantity E2E

Use only a disposable/development inventory item and location that can be safely adjusted.

1. Optional read-only preparation: run `inventory.lookup` with one explicit inventory item ID, product variant ID, or SKU to collect the test `inventoryItemId`, `locationId`, and current available quantity. Keep only safe pass/fail evidence and compact IDs/quantities; do not record raw Shopify responses or product/location dumps.

2. Run `inventory.adjustQuantity.preview` with explicit test data:

```json
{
  "inventoryItemId": "gid://shopify/InventoryItem/<test-inventory-item-id>",
  "locationId": "gid://shopify/Location/<test-location-id>",
  "delta": -2,
  "reason": "correction",
  "referenceDocumentUri": "gid://store-agent/TestRun/<safe-id>"
}
```

3. Review the preview binding values and `executeRequest`.

4. Confirm read-only mode is explicitly off only for this development-store test.

5. Confirm local granted scopes include `write_inventory`.

6. Run `inventory.adjustQuantity.execute` with the reviewed binding values and `confirmed: true`.

7. Confirm:

- The inventory quantity is adjusted only for the explicit inventory item/location pair.
- The mutation is limited to `inventoryAdjustQuantities` with quantity name `available`.
- No product, SKU, inventory item, or location lookup/discovery is performed during execute.
- No bulk inventory, state move, inter-location transfer, product update, or location management operation is performed.
- Output and audit contain no secrets, raw reviewed payload, raw Shopify response, product dump, location dump, or full Shopify node.

## Inventory Move Quantity E2E

Use only a disposable/development inventory item and location where moving quantity between states is safe. This validates a state move at one explicit location, not a transfer between locations.

1. Optional read-only preparation: run `inventory.lookup` with one explicit inventory item ID, product variant ID, or SKU to collect the test `inventoryItemId`, `locationId`, and named quantities. Keep only safe pass/fail evidence and compact IDs/quantities; do not record raw Shopify responses or product/location dumps.

2. Run `inventory.moveQuantity.preview` with explicit test data:

```json
{
  "inventoryItemId": "gid://shopify/InventoryItem/<test-inventory-item-id>",
  "locationId": "gid://shopify/Location/<test-location-id>",
  "quantity": 1,
  "fromName": "available",
  "toName": "reserved",
  "reason": "correction",
  "referenceDocumentUri": "gid://store-agent/TestRun/<safe-id>"
}
```

Use a source and destination quantity name that are valid for the store and safe for the test item. Source and destination names must differ.

3. Review the preview binding values and `executeRequest`.

4. Confirm read-only mode is explicitly off only for this development-store test.

5. Confirm local granted scopes include `write_inventory`.

6. Run `inventory.moveQuantity.execute` with the reviewed binding values and `confirmed: true`.

7. Confirm:

- The inventory quantity is moved only for the explicit inventory item/location pair.
- The mutation is limited to `inventoryMoveQuantities`.
- The move is between quantity states at the same explicit location.
- No product, SKU, inventory item, or location lookup/discovery is performed during execute.
- No bulk inventory, inter-location transfer, product update, or location management operation is performed.
- Output and audit contain no secrets, raw reviewed payload, raw Shopify response, product dump, location dump, or full Shopify node.

## Inventory Transfer Draft E2E

Use only a disposable/development inventory item and locations where creating a draft transfer is safe. This validates draft transfer creation only; it does not mark the transfer ready to ship, ship, receive, or cancel it.

1. Optional read-only preparation: run `inventory.lookup` and `inventory.locationLookup` with explicit IDs, SKU, names, or queries to collect the test `inventoryItemId`, source `locationId`, and destination `locationId`. Keep only safe pass/fail evidence and compact IDs; do not record raw Shopify responses or product/location dumps.

2. Run `inventory.transfer.preview` with explicit test data:

```json
{
  "inventoryItemId": "gid://shopify/InventoryItem/<test-inventory-item-id>",
  "fromLocationId": "gid://shopify/Location/<source-location-id>",
  "toLocationId": "gid://shopify/Location/<destination-location-id>",
  "quantity": 1,
  "reason": "rebalance",
  "referenceDocumentUri": "gid://store-agent/TestRun/<safe-id>"
}
```

3. Review the preview binding values and `executeRequest`.

4. Confirm read-only mode is explicitly off only for this development-store test.

5. Confirm local granted scopes include both `write_inventory_transfers` and `read_inventory_transfers`.

6. Run `inventory.transfer.execute` with the reviewed binding values and `confirmed: true`.

7. Confirm:

- The draft transfer references only the explicit inventory item, source location, destination location, and quantity.
- The mutation is limited to `inventoryTransferCreate`.
- No transfer lifecycle action is performed.
- No product, SKU, inventory item, or location lookup/discovery is performed during execute.
- No bulk inventory, product update, or location management operation is performed.
- Output and audit contain no secrets, raw reviewed payload, raw Shopify response, product dump, location dump, or full Shopify node.

## Inventory Transfer Mark-Ready E2E

Use only a disposable/development inventory transfer where marking it ready to ship is safe. This validates only the ready-to-ship lifecycle step; it does not create, edit, ship, receive, or cancel transfers.

1. Prepare or identify a safe draft inventory transfer ID from a previous reviewed `inventory.transfer.execute` run or from user-provided development-store context. Do not discover transfer IDs autonomously during execute.

2. Run `inventory.transfer.markReady.preview` with explicit test data:

```json
{
  "inventoryTransferId": "gid://shopify/InventoryTransfer/<test-transfer-id>",
  "currentStatus": "DRAFT"
}
```

3. Review the preview binding values and `executeRequest`.

4. Confirm read-only mode is explicitly off only for this development-store test.

5. Confirm local granted scopes include both `write_inventory_transfers` and `read_inventory_transfers`.

6. Run `inventory.transfer.markReady.execute` with the reviewed binding values and `confirmed: true`.

7. Confirm:

- The mutation is limited to `inventoryTransferMarkAsReadyToShip`.
- The transfer ID comes from the stored preview.
- No transfer create, item edit, ship, receive, or cancel action is performed.
- No transfer lookup/discovery is performed during execute.
- No bulk inventory, product update, or location management operation is performed.
- Output and audit contain no secrets, raw reviewed payload, raw Shopify response, product dump, location dump, transfer dump, or full Shopify node.

## Negative Tests

Run these manually against the development-store setup:

- Read-only mode on: `page.create.execute`, `product.create.execute`, `product.update.execute`, `collection.create.execute`, `inventory.setQuantity.execute`, `inventory.adjustQuantity.execute`, `inventory.moveQuantity.execute`, `inventory.transfer.execute`, and `inventory.transfer.markReady.execute` return `blocked`.
- Missing `confirmed: true`: execute returns `blocked`.
- Missing `previewId`: execute returns `blocked`.
- Expired preview: execute returns `blocked`.
- Mismatched target, preview hash, reviewed payload, or reviewed changes hash: execute returns `blocked`.
- Missing or unknown write scope: execute returns `blocked` before fetch.
- Unrelated loose execute input is ignored after a valid stored preview binding.
- Product update with handle-only target and no safe product ID returns `blocked`.
- Collection create from rule-based or smart collection preview returns `blocked`.
- Inventory set quantity without `compareQuantity` and without explicit `ignoreCompareQuantity: true` returns `blocked` or preview validation failure.
- Inventory move quantity with the same source and destination quantity name returns `blocked` or preview validation failure.
- Remaining placeholder execute tools return `not_implemented` after valid binding.

Placeholder execute tools are:

```text
product.media.update.execute
product.importFromUserUrl.execute
customer.updateAddress.execute
tracking.update.execute
refund.execute
bulk.execute
theme.apply
theme.rollback
```

## Audit And Output Checklist

Confirm:

- No raw Admin API token.
- No OAuth client secret.
- No Theme Access token.
- No raw reviewed payload.
- No full Shopify node.
- No order/customer dump.
- Blocked cases audit `blocked`.
- Placeholder cases audit `not_implemented`.
- Successful `page.create.execute`, `product.create.execute`, `product.update.execute`, `collection.create.execute`, `inventory.setQuantity.execute`, `inventory.adjustQuantity.execute`, `inventory.moveQuantity.execute`, `inventory.transfer.execute`, and `inventory.transfer.markReady.execute` audit `success` only after Shopify write success.

## Troubleshooting

- Read-only mode is still enabled: rerun setup or update local config for a development-store write test only.
- Granted scopes are missing or unknown: rerun setup/auth with explicit minimal write scopes for the target execute path.
- Preview expired or disappeared: create a new preview. Safe preview records persist locally by default, but missing, corrupt, expired, or mismatched records still fail closed.
- MCP server restarted: confirm the same local preview store path is being used, or create a new preview before execute.
- Wrong target, hash, or reviewed payload: rerun preview, review the stored preview content, and execute with matching binding values.
- Shopify returns `userErrors`: inspect the safe user error summary and adjust the test input.
- Token lacks scope: update the development-store app/token scopes, reinstall if needed, and refresh local config.
- Wrong store URL: rerun setup for the intended development store.
- MCP host uses an old config/snippet: refresh the host snippet and restart the MCP host.
