export const defaultAdminScopes = [
  "read_products",
  "write_products",
  "read_inventory",
  "write_inventory",
  "read_orders",
  "write_orders",
  "read_order_edits",
  "write_order_edits",
  "read_customers",
  "write_customers",
  "read_fulfillments",
  "write_fulfillments",
  "read_assigned_fulfillment_orders",
  "write_assigned_fulfillment_orders",
  "read_merchant_managed_fulfillment_orders",
  "write_merchant_managed_fulfillment_orders",
  "read_third_party_fulfillment_orders",
  "write_third_party_fulfillment_orders",
  "read_shipping",
  "write_shipping",
  "read_content",
  "write_content",
  "read_online_store_pages",
  "read_files",
  "write_files",
  "read_themes",
  "write_themes",
  "read_metaobjects",
  "write_metaobjects",
  "read_metaobject_definitions",
  "write_metaobject_definitions",
  "read_translations",
  "write_translations"
] as const;

export const defaultReadOnlyAdminScopes = [
  "read_products",
  "read_orders",
  "read_customers",
  "read_fulfillments",
  "read_content",
  "read_online_store_pages",
  "read_files",
  "read_themes",
  "read_inventory",
  "read_metaobjects",
  "read_metaobject_definitions",
  "read_translations"
] as const;

export function normalizeScopes(input: string | readonly string[]): string[] {
  const raw: readonly string[] = typeof input === "string" ? input.split(",") : input;
  return [...new Set(raw.map((scope) => scope.trim()).filter(Boolean))];
}

export function scopesToString(scopes: readonly string[]): string {
  return normalizeScopes(scopes).join(",");
}
