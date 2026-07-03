# Shopify Scopes

Use the minimum scopes needed for the workflows the merchant enables.

Suggested v1 scope map:

- Products and collections: `read_products`, `write_products`
- Orders and refunds: `read_orders`, `write_orders`
- Customers and addresses: `read_customers`, `write_customers`
- Fulfillment and tracking: `read_fulfillments`, `write_fulfillments`
- Pages/content: `read_content`, `write_content`
- Shipping/carrier data: `read_shipping`, `write_shipping`
- Theme files: `read_themes`, `write_themes`

New custom apps should be created through Shopify Dev Dashboard or Shopify CLI. The old Shopify Admin custom-app flow is not the default path for new users.

Theme file writes are capability-tested because Shopify documents additional access requirements for GraphQL theme file mutations such as `themeFilesUpsert`.
