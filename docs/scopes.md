# Shopify Scopes

Request only the Shopify scopes required for the workflows a tester enables. Broad write scopes are optional and should not be requested by default when a workflow is read-only or not in use.

Do not ask users for live-store access during early testing unless absolutely necessary. Prefer development stores and test data.

Protected customer/order data may require additional Shopify permissions or app review depending on the data, app type, and store context.

## Products

- Read: `read_products`
- Write: `write_products`

Use for product creation, updates, variants, collections, and product-level metadata where applicable.

`product.create.execute` requires `write_products` in local granted-scope preflight. Shopify remains the ultimate scope enforcement layer, but the agent blocks locally before fetch when known granted scopes do not include `write_products`, or when local granted scopes are unknown. The current product create execute path is minimal: title, description/body HTML summary, vendor, product type, status, and tags only. Variants, inventory, media/files/images, collections, metafields, SEO bulk changes, publications, translations, updates, deletes, and bulk operations are outside this write path.

`product.update.execute` also requires `write_products` in local granted-scope preflight. It is limited to one stored `product.update.preview` shape at a time: basic fields (title, description/descriptionHtml, vendor, product type, status, and tags), explicit variant price updates with product ID, variant IDs, and prices, explicit variant creation with product ID, option values, and optional price/SKU, explicit option creation with product ID, option names, and values using `LEAVE_AS_IS`, or explicit option rename with product ID, option ID, and new name using `LEAVE_AS_IS`. Mixed update-shape previews fail closed before fetch. Handle-only previews fail closed unless the stored preview contains a safe product ID. Option value add/update/delete, option reorder/delete, inventory, media/files/images, collections, metafields, SEO, publications, translations, deletes, and bulk operations remain outside this write path.

## Inventory

- Read: `read_inventory`
- Write: `write_inventory`

Use only when inventory quantities, locations, or inventory item data are part of the enabled workflow.

## Orders

- Read: `read_orders`
- Write: `write_orders`
- Optional order edits: `read_order_edits`, `write_order_edits`

Use for order lookup, order details, order/customer-service context, and order-edit workflows.

## Refunds

Refund behavior uses order/refund capabilities exposed through Shopify order APIs. Start with `read_orders` and `write_orders`, then capability-test actual refund operations for the store/app.

Risky refund execution must always require preview, idempotency, and explicit confirmation.

## Customers

- Read: `read_customers`
- Write: `write_customers`

Use for customer lookup and customer/address updates. Protected customer data may require additional permissions.

## Fulfillments And Tracking

- Read/write fulfillments: `read_fulfillments`, `write_fulfillments`
- Assigned fulfillment orders: `read_assigned_fulfillment_orders`, `write_assigned_fulfillment_orders`
- Merchant-managed fulfillment orders: `read_merchant_managed_fulfillment_orders`, `write_merchant_managed_fulfillment_orders`
- Third-party fulfillment orders: `read_third_party_fulfillment_orders`, `write_third_party_fulfillment_orders`
- Shipping: `read_shipping`, `write_shipping`

Use only the fulfillment-order scopes that match the store's fulfillment workflow.

## Content And Pages

- Read content/pages: `read_content`, `read_online_store_pages`
- Write content/pages: `write_content`, `write_online_store_pages`

`page.create.execute` accepts either `write_content` or `write_online_store_pages` in local granted-scope preflight. Shopify remains the ultimate scope enforcement layer, but the agent blocks locally before fetch when known granted scopes do not include either accepted page write scope, or when local granted scopes are unknown.

## Files And Media

- Read: `read_files`
- Write: `write_files`

Use for file/media workflows when product images, generated images, or uploaded assets are managed through Shopify Files.

## Themes

- Read: `read_themes`
- Write: `write_themes`

Theme file writes require capability testing. Prefer preview-first routes and apply only after explicit confirmation.

Theme app extensions and Shopify CLI workflows may require additional local tooling even when API scopes are present.

## Metaobjects And Translations

- Metaobjects: `read_metaobjects`, `write_metaobjects`
- Metaobject definitions: `read_metaobject_definitions`, `write_metaobject_definitions`
- Translations: `read_translations`, `write_translations`

Use only when workflows explicitly manage structured content, theme/content data, or translations.

## Historical Orders And `read_all_orders`

`read_all_orders` is not part of the default V1 scope list because Shopify requires separate approval before it can be added.

V1 can test normal order workflows with `read_orders` and `write_orders`. Historical orders outside Shopify's default order window require `read_all_orders` later.

## Default V1 Scope List

The code includes a broad local default for development convenience, but production setup should request only the scopes required for the enabled workflow. Keep write scopes disabled unless the user explicitly enables writes.
