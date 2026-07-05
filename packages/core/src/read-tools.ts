import type { StoreAgentConfig } from "./config.js";
import { ShopifyGraphqlClient, type FetchLike, type ShopifyGraphqlResult } from "./shopify-client.js";

export interface ReadDiagnostic {
  severity: "info" | "warning" | "error";
  code: string;
  message: string;
  recommendation?: string;
}

export interface ReadResult<T> {
  ok: boolean;
  status: "ok" | "missing_input" | "not_found" | "multiple_matches" | "shopify_error" | "invalid_response";
  summary: string;
  item?: T;
  matches?: T[];
  diagnostics: ReadDiagnostic[];
}

export interface MoneySummary {
  amount?: string;
  currencyCode?: string;
}

export interface TrackingSummary {
  fulfillmentId?: string;
  orderId?: string;
  orderName?: string;
  status?: string;
  company?: string;
  number?: string;
  url?: string;
}

export interface OrderSummary {
  id: string;
  name?: string;
  createdAt?: string;
  displayFinancialStatus?: string;
  displayFulfillmentStatus?: string;
  customer?: {
    id?: string;
    displayName?: string;
    email?: string;
  };
  totalPrice?: MoneySummary;
  tracking: TrackingSummary[];
}

export interface CustomerSummary {
  id: string;
  displayName?: string;
  email?: string;
  numberOfOrders?: string;
}

export interface ProductSummary {
  id: string;
  title?: string;
  handle?: string;
  status?: string;
  vendor?: string;
  productType?: string;
}

export interface InventoryQuantitySummary {
  name: string;
  quantity: number;
}

export interface InventoryLevelSummary {
  id?: string;
  locationId?: string;
  locationName?: string;
  availableQuantity?: number;
  quantities: InventoryQuantitySummary[];
}

export interface InventoryVariantSummary {
  id: string;
  title?: string;
  sku?: string;
  product?: {
    id?: string;
    title?: string;
    handle?: string;
  };
}

export interface InventoryLookupSummary {
  inventoryItemId: string;
  sku?: string;
  tracked?: boolean;
  variants: InventoryVariantSummary[];
  levels: InventoryLevelSummary[];
}

export interface InventoryLocationSummary {
  id: string;
  name?: string;
  isActive?: boolean;
  fulfillsOnlineOrders?: boolean;
}

export interface ReadToolOptions {
  fetcher?: FetchLike;
}

export async function findOrders(
  config: StoreAgentConfig,
  input: { query?: string; email?: string; orderNumber?: string; id?: string; first?: number },
  options: ReadToolOptions = {}
): Promise<ReadResult<OrderSummary>> {
  const id = firstString(input.id);
  if (id) {
    const result = await getOrder(config, { id }, options);
    return result.item ? okMatches([result.item], "Found 1 order match.") : { ...result, matches: [] };
  }

  const query = buildOrderSearchQuery(input);
  if (!query) return missingInput("Provide an order ID, order number, customer email, or explicit order search query.");

  const client = new ShopifyGraphqlClient(config, options.fetcher);
  const result = await client.request<OrderFindData>({
    query: orderFindQuery,
    variables: { query, first: clampFirst(input.first) }
  });
  if (!result.ok) return mapGraphqlFailure<OrderSummary>(result);
  if (!Array.isArray(result.data.orders?.nodes)) return invalidResponse("Shopify order search response did not include order nodes.");

  const matches = result.data.orders.nodes.map(toOrderSummary).filter(isDefined);
  if (matches.length === 0) return okMatches([], "No matching orders found.", "not_found");
  return okMatches(matches, matches.length === 1 ? "Found 1 order match." : `Found ${matches.length} order matches.`, matches.length > 1 ? "multiple_matches" : "ok");
}

export async function getOrder(
  config: StoreAgentConfig,
  input: { id?: string; orderId?: string },
  options: ReadToolOptions = {}
): Promise<ReadResult<OrderSummary>> {
  const id = firstString(input.id, input.orderId);
  if (!id) return missingInput("Provide an explicit Shopify order ID.");

  const client = new ShopifyGraphqlClient(config, options.fetcher);
  const result = await client.request<OrderGetData>({
    query: orderGetQuery,
    variables: { id }
  });
  if (!result.ok) return mapGraphqlFailure<OrderSummary>(result);
  const order = result.data.node?.__typename === "Order" ? toOrderSummary(result.data.node) : undefined;
  if (!order) return okItem<OrderSummary>(undefined, "Order was not found.", "not_found");
  return okItem(order, `Found order ${order.name ?? order.id}.`);
}

export async function findCustomers(
  config: StoreAgentConfig,
  input: { query?: string; email?: string; id?: string; first?: number },
  options: ReadToolOptions = {}
): Promise<ReadResult<CustomerSummary>> {
  const id = firstString(input.id);
  if (id) {
    const client = new ShopifyGraphqlClient(config, options.fetcher);
    const result = await client.request<CustomerGetData>({ query: customerGetQuery, variables: { id } });
    if (!result.ok) return mapGraphqlFailure<CustomerSummary>(result);
    const customer = result.data.node?.__typename === "Customer" ? toCustomerSummary(result.data.node) : undefined;
    return customer ? okMatches([customer], "Found 1 customer match.") : okMatches([], "No matching customers found.", "not_found");
  }

  const query = buildCustomerSearchQuery(input);
  if (!query) return missingInput("Provide a customer ID, email, or explicit customer search query.");

  const client = new ShopifyGraphqlClient(config, options.fetcher);
  const result = await client.request<CustomerFindData>({
    query: customerFindQuery,
    variables: { query, first: clampFirst(input.first) }
  });
  if (!result.ok) return mapGraphqlFailure<CustomerSummary>(result);
  if (!Array.isArray(result.data.customers?.nodes)) return invalidResponse("Shopify customer search response did not include customer nodes.");
  const matches = result.data.customers.nodes.map(toCustomerSummary).filter(isDefined);
  if (matches.length === 0) return okMatches([], "No matching customers found.", "not_found");
  return okMatches(matches, matches.length === 1 ? "Found 1 customer match." : `Found ${matches.length} customer matches.`, matches.length > 1 ? "multiple_matches" : "ok");
}

export async function getTracking(
  config: StoreAgentConfig,
  input: { orderId?: string; fulfillmentId?: string; trackingNumber?: string; query?: string; first?: number },
  options: ReadToolOptions = {}
): Promise<ReadResult<TrackingSummary>> {
  const fulfillmentId = firstString(input.fulfillmentId);
  if (fulfillmentId) return getTrackingByFulfillment(config, fulfillmentId, options);

  const orderId = firstString(input.orderId);
  if (orderId) {
    const order = await getOrder(config, { id: orderId }, options);
    if (!order.item) return { ok: order.ok, status: order.status, summary: order.summary, matches: [], diagnostics: order.diagnostics };
    return trackingMatches(order.item.tracking, order.item.tracking.length ? `Found ${order.item.tracking.length} tracking entries for ${order.item.name ?? order.item.id}.` : "No tracking entries found for this order.");
  }

  const query = firstString(input.trackingNumber, input.query);
  if (!query) return missingInput("Provide an order ID, fulfillment ID, tracking number, or explicit tracking query.");

  const orders = await findOrders(config, { query, first: input.first }, options);
  if (!orders.matches) return { ok: orders.ok, status: orders.status, summary: orders.summary, matches: [], diagnostics: orders.diagnostics };
  const tracking = orders.matches.flatMap((order) => order.tracking);
  return trackingMatches(tracking, tracking.length ? `Found ${tracking.length} tracking entries.` : "No tracking entries found.");
}

export async function getProduct(
  config: StoreAgentConfig,
  input: { id?: string; productId?: string; handle?: string },
  options: ReadToolOptions = {}
): Promise<ReadResult<ProductSummary>> {
  const id = firstString(input.id, input.productId);
  const handle = firstString(input.handle);
  if (!id && !handle) return missingInput("Provide a product ID or handle.");

  const client = new ShopifyGraphqlClient(config, options.fetcher);
  const result = await client.request<ProductGetData>({
    query: id ? productGetByIdQuery : productGetByHandleQuery,
    variables: id ? { id } : { handle }
  });
  if (!result.ok) return mapGraphqlFailure<ProductSummary>(result);
  const node = id ? result.data.node : result.data.productByHandle;
  const product = node?.__typename === "Product" || result.data.productByHandle ? toProductSummary(node) : undefined;
  if (!product) return okItem<ProductSummary>(undefined, "Product was not found.", "not_found");
  return okItem(product, `Found product ${product.title ?? product.id}.`);
}

export async function lookupInventory(
  config: StoreAgentConfig,
  input: { inventoryItemId?: string; variantId?: string; sku?: string; first?: number; levelsFirst?: number },
  options: ReadToolOptions = {}
): Promise<ReadResult<InventoryLookupSummary>> {
  const inventoryItemId = firstString(input.inventoryItemId);
  const variantId = firstString(input.variantId);
  const sku = firstString(input.sku);
  const inputCount = [inventoryItemId, variantId, sku].filter(Boolean).length;
  if (inputCount === 0) return missingInput("Provide one explicit inventory item ID, product variant ID, or SKU.");
  if (inputCount > 1) return missingInput("Provide only one inventory lookup input at a time: inventory item ID, product variant ID, or SKU.");

  const client = new ShopifyGraphqlClient(config, options.fetcher);
  const levelsFirst = clampFirst(input.levelsFirst);
  if (inventoryItemId) {
    const result = await client.request<InventoryItemLookupData>({
      query: inventoryLookupByItemQuery,
      variables: { id: inventoryItemId, levelsFirst }
    });
    if (!result.ok) return mapGraphqlFailure<InventoryLookupSummary>(result);
    const item = toInventoryLookupSummary(result.data.inventoryItem);
    if (!item) return okItem<InventoryLookupSummary>(undefined, "Inventory item was not found.", "not_found");
    return okItem(item, `Found inventory item ${item.inventoryItemId}.`);
  }

  if (variantId) {
    const result = await client.request<InventoryVariantLookupData>({
      query: inventoryLookupByVariantQuery,
      variables: { id: variantId, levelsFirst }
    });
    if (!result.ok) return mapGraphqlFailure<InventoryLookupSummary>(result);
    const variant = result.data.node?.__typename === "ProductVariant" ? result.data.node : undefined;
    const item = toInventoryLookupSummary(variant?.inventoryItem, variant ? [variant] : []);
    if (!item) return okItem<InventoryLookupSummary>(undefined, "Product variant or inventory item was not found.", "not_found");
    return okItem(item, `Found inventory item ${item.inventoryItemId} for variant ${variant?.id ?? variantId}.`);
  }

  const result = await client.request<InventorySkuLookupData>({
    query: inventoryLookupBySkuQuery,
    variables: { query: `sku:${escapeSearchValue(sku)}`, first: clampFirst(input.first), levelsFirst }
  });
  if (!result.ok) return mapGraphqlFailure<InventoryLookupSummary>(result);
  if (!Array.isArray(result.data.productVariants?.nodes)) return invalidResponse("Shopify inventory lookup response did not include variant nodes.");

  const matches = result.data.productVariants.nodes
    .map((variant) => toInventoryLookupSummary(variant.inventoryItem, [variant]))
    .filter(isDefined);
  if (matches.length === 0) return okMatches([], "No matching inventory items found.", "not_found");
  return okMatches(matches, matches.length === 1 ? "Found 1 inventory item match." : `Found ${matches.length} inventory item matches.`, matches.length > 1 ? "multiple_matches" : "ok");
}

export async function lookupInventoryLocations(
  config: StoreAgentConfig,
  input: { locationId?: string; id?: string; name?: string; query?: string; first?: number; includeInactive?: boolean; includeLegacy?: boolean },
  options: ReadToolOptions = {}
): Promise<ReadResult<InventoryLocationSummary>> {
  const locationId = firstString(input.locationId, input.id);
  const query = firstString(input.query) || locationNameQuery(input.name);
  if (!locationId && !query) return missingInput("Provide an explicit location ID, location name, or location query.");
  if (locationId && query) return missingInput("Provide only one inventory location lookup input at a time: location ID, name, or query.");

  const client = new ShopifyGraphqlClient(config, options.fetcher);
  if (locationId) {
    const result = await client.request<InventoryLocationGetData>({
      query: inventoryLocationGetQuery,
      variables: { id: locationId }
    });
    if (!result.ok) return mapGraphqlFailure<InventoryLocationSummary>(result);
    const location = result.data.node?.__typename === "Location" ? toInventoryLocationSummary(result.data.node) : undefined;
    if (!location) return okItem<InventoryLocationSummary>(undefined, "Inventory location was not found.", "not_found");
    return okItem(location, `Found inventory location ${location.name ?? location.id}.`);
  }

  const result = await client.request<InventoryLocationLookupData>({
    query: inventoryLocationLookupQuery,
    variables: {
      query,
      first: clampFirst(input.first),
      includeInactive: input.includeInactive === true,
      includeLegacy: input.includeLegacy === true
    }
  });
  if (!result.ok) return mapGraphqlFailure<InventoryLocationSummary>(result);
  if (!Array.isArray(result.data.locations?.nodes)) return invalidResponse("Shopify location lookup response did not include location nodes.");

  const matches = result.data.locations.nodes.map(toInventoryLocationSummary).filter(isDefined);
  if (matches.length === 0) return okMatches([], "No matching inventory locations found.", "not_found");
  return okMatches(matches, matches.length === 1 ? "Found 1 inventory location match." : `Found ${matches.length} inventory location matches.`, matches.length > 1 ? "multiple_matches" : "ok");
}

function mapGraphqlFailure<T>(result: Extract<ShopifyGraphqlResult<unknown>, { ok: false }>): ReadResult<T> {
  return {
    ok: false,
    status: "shopify_error",
    summary: result.error.message,
    diagnostics: [{
      severity: result.error.accessDenied ? "error" : "warning",
      code: result.error.type,
      message: result.error.message,
      recommendation: result.error.accessDenied ? "Check Admin API token scopes for this read operation." : undefined
    }]
  };
}

function missingInput<T>(message: string): ReadResult<T> {
  return {
    ok: false,
    status: "missing_input",
    summary: message,
    diagnostics: [{ severity: "warning", code: "missing_input", message }]
  };
}

function invalidResponse<T>(message: string): ReadResult<T> {
  return {
    ok: false,
    status: "invalid_response",
    summary: message,
    diagnostics: [{ severity: "error", code: "invalid_response", message }]
  };
}

function okMatches<T>(matches: T[], summary: string, status: ReadResult<T>["status"] = "ok"): ReadResult<T> {
  return { ok: true, status, summary, matches, diagnostics: [] };
}

function okItem<T>(item: T | undefined, summary: string, status: ReadResult<T>["status"] = "ok"): ReadResult<T> {
  return { ok: Boolean(item), status, summary, item, diagnostics: [] };
}

function trackingMatches(matches: TrackingSummary[], summary: string): ReadResult<TrackingSummary> {
  return { ok: true, status: matches.length ? "ok" : "not_found", summary, matches, diagnostics: [] };
}

function buildOrderSearchQuery(input: { query?: string; email?: string; orderNumber?: string }): string {
  const query = firstString(input.query);
  if (query) return query;
  const email = firstString(input.email);
  if (email) return `email:${email}`;
  const orderNumber = firstString(input.orderNumber);
  if (orderNumber) return `name:${orderNumber.startsWith("#") ? orderNumber : `#${orderNumber}`}`;
  return "";
}

function buildCustomerSearchQuery(input: { query?: string; email?: string }): string {
  const query = firstString(input.query);
  if (query) return query;
  const email = firstString(input.email);
  if (email) return `email:${email}`;
  return "";
}

function clampFirst(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? Math.max(1, Math.min(10, Math.floor(value))) : 5;
}

function firstString(...values: unknown[]): string {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return "";
}

function escapeSearchValue(value: string): string {
  if (/^[A-Za-z0-9_.:-]+$/.test(value)) return value;
  return `"${value.replace(/\\/g, "\\\\").replace(/"/g, "\\\"")}"`;
}

function locationNameQuery(value: unknown): string {
  const name = firstString(value);
  return name ? `name:${escapeSearchValue(name)}` : "";
}

function isDefined<T>(value: T | undefined): value is T {
  return value !== undefined;
}

function toOrderSummary(node: OrderNode | undefined): OrderSummary | undefined {
  if (!node?.id) return undefined;
  return {
    id: node.id,
    name: node.name,
    createdAt: node.createdAt,
    displayFinancialStatus: node.displayFinancialStatus,
    displayFulfillmentStatus: node.displayFulfillmentStatus,
    customer: node.customer ? {
      id: node.customer.id,
      displayName: node.customer.displayName,
      email: node.customer.email
    } : undefined,
    totalPrice: node.totalPriceSet?.shopMoney ? {
      amount: node.totalPriceSet.shopMoney.amount,
      currencyCode: node.totalPriceSet.shopMoney.currencyCode
    } : undefined,
    tracking: (node.fulfillments ?? []).flatMap((fulfillment) => (fulfillment.trackingInfo ?? []).map((tracking) => ({
      fulfillmentId: fulfillment.id,
      orderId: node.id,
      orderName: node.name,
      status: fulfillment.status,
      company: tracking.company,
      number: tracking.number,
      url: tracking.url
    })))
  };
}

function toCustomerSummary(node: CustomerNode | undefined): CustomerSummary | undefined {
  if (!node?.id) return undefined;
  return {
    id: node.id,
    displayName: node.displayName,
    email: node.email,
    numberOfOrders: node.numberOfOrders
  };
}

function toProductSummary(node: ProductNode | undefined): ProductSummary | undefined {
  if (!node?.id) return undefined;
  return {
    id: node.id,
    title: node.title,
    handle: node.handle,
    status: node.status,
    vendor: node.vendor,
    productType: node.productType
  };
}

function toInventoryLookupSummary(item: InventoryItemNode | undefined, variantOverride?: InventoryVariantNode[]): InventoryLookupSummary | undefined {
  if (!item?.id) return undefined;
  const variants = (variantOverride ?? item.variants?.nodes ?? []).map(toInventoryVariantSummary).filter(isDefined);
  return {
    inventoryItemId: item.id,
    sku: item.sku,
    tracked: item.tracked,
    variants,
    levels: (item.inventoryLevels?.nodes ?? []).map(toInventoryLevelSummary).filter(isDefined)
  };
}

function toInventoryVariantSummary(node: InventoryVariantNode | undefined): InventoryVariantSummary | undefined {
  if (!node?.id) return undefined;
  return {
    id: node.id,
    title: node.title,
    sku: node.sku,
    product: node.product ? {
      id: node.product.id,
      title: node.product.title,
      handle: node.product.handle
    } : undefined
  };
}

function toInventoryLevelSummary(node: InventoryLevelNode | undefined): InventoryLevelSummary | undefined {
  if (!node?.id && !node?.location?.id) return undefined;
  const quantities = (node.quantities ?? [])
    .filter((quantity): quantity is InventoryQuantitySummary => typeof quantity?.name === "string" && typeof quantity.quantity === "number")
    .map((quantity) => ({ name: quantity.name, quantity: quantity.quantity }));
  return {
    id: node.id,
    locationId: node.location?.id,
    locationName: node.location?.name,
    availableQuantity: quantities.find((quantity) => quantity.name === "available")?.quantity,
    quantities
  };
}

function toInventoryLocationSummary(node: InventoryLocationNode | undefined): InventoryLocationSummary | undefined {
  if (!node?.id) return undefined;
  return {
    id: node.id,
    name: node.name,
    isActive: node.isActive,
    fulfillsOnlineOrders: node.fulfillsOnlineOrders
  };
}

async function getTrackingByFulfillment(config: StoreAgentConfig, id: string, options: ReadToolOptions): Promise<ReadResult<TrackingSummary>> {
  const client = new ShopifyGraphqlClient(config, options.fetcher);
  const result = await client.request<FulfillmentGetData>({ query: fulfillmentGetQuery, variables: { id } });
  if (!result.ok) return mapGraphqlFailure<TrackingSummary>(result);
  const node = result.data.node?.__typename === "Fulfillment" ? result.data.node : undefined;
  if (!node) return trackingMatches([], "Fulfillment was not found.");
  return trackingMatches((node.trackingInfo ?? []).map((tracking: TrackingNode) => ({
    fulfillmentId: node.id,
    orderId: node.order?.id,
    orderName: node.order?.name,
    status: node.status,
    company: tracking.company,
    number: tracking.number,
    url: tracking.url
  })), "Found tracking entries for fulfillment.");
}

interface MoneyNode {
  amount?: string;
  currencyCode?: string;
}

interface TrackingNode {
  company?: string;
  number?: string;
  url?: string;
}

interface OrderNode {
  __typename?: string;
  id?: string;
  name?: string;
  createdAt?: string;
  displayFinancialStatus?: string;
  displayFulfillmentStatus?: string;
  customer?: {
    id?: string;
    displayName?: string;
    email?: string;
  };
  totalPriceSet?: {
    shopMoney?: MoneyNode;
  };
  fulfillments?: Array<{
    id?: string;
    status?: string;
    trackingInfo?: TrackingNode[];
  }>;
}

interface CustomerNode {
  __typename?: string;
  id?: string;
  displayName?: string;
  email?: string;
  numberOfOrders?: string;
}

interface ProductNode {
  __typename?: string;
  id?: string;
  title?: string;
  handle?: string;
  status?: string;
  vendor?: string;
  productType?: string;
}

interface InventoryQuantityNode {
  name?: string;
  quantity?: number;
}

interface InventoryLevelNode {
  id?: string;
  location?: {
    id?: string;
    name?: string;
  };
  quantities?: InventoryQuantityNode[];
}

interface InventoryVariantNode {
  __typename?: string;
  id?: string;
  title?: string;
  sku?: string;
  product?: {
    id?: string;
    title?: string;
    handle?: string;
  };
  inventoryItem?: InventoryItemNode;
}

interface InventoryItemNode {
  id?: string;
  sku?: string;
  tracked?: boolean;
  variants?: { nodes?: InventoryVariantNode[] };
  inventoryLevels?: { nodes?: InventoryLevelNode[] };
}

interface InventoryLocationNode {
  __typename?: string;
  id?: string;
  name?: string;
  isActive?: boolean;
  fulfillsOnlineOrders?: boolean;
}

interface OrderFindData {
  orders?: { nodes?: OrderNode[] };
}

interface OrderGetData {
  node?: OrderNode;
}

interface CustomerFindData {
  customers?: { nodes?: CustomerNode[] };
}

interface CustomerGetData {
  node?: CustomerNode;
}

interface FulfillmentGetData {
  node?: {
    __typename?: string;
    id?: string;
    status?: string;
    trackingInfo?: TrackingNode[];
    order?: { id?: string; name?: string };
  };
}

interface ProductGetData {
  node?: ProductNode;
  productByHandle?: ProductNode;
}

interface InventoryItemLookupData {
  inventoryItem?: InventoryItemNode;
}

interface InventoryVariantLookupData {
  node?: InventoryVariantNode;
}

interface InventorySkuLookupData {
  productVariants?: { nodes?: InventoryVariantNode[] };
}

interface InventoryLocationGetData {
  node?: InventoryLocationNode;
}

interface InventoryLocationLookupData {
  locations?: { nodes?: InventoryLocationNode[] };
}

const orderFields = `
  id
  name
  createdAt
  displayFinancialStatus
  displayFulfillmentStatus
  customer {
    id
    displayName
    email
  }
  totalPriceSet {
    shopMoney {
      amount
      currencyCode
    }
  }
  fulfillments(first: 5) {
    id
    status
    trackingInfo {
      company
      number
      url
    }
  }
`;

const orderFindQuery = `#graphql
query ShopifyStoreAgentOrderFind($query: String!, $first: Int!) {
  orders(first: $first, query: $query, sortKey: CREATED_AT, reverse: true) {
    nodes {
      ${orderFields}
    }
  }
}`;

const orderGetQuery = `#graphql
query ShopifyStoreAgentOrderGet($id: ID!) {
  node(id: $id) {
    __typename
    ... on Order {
      ${orderFields}
    }
  }
}`;

const customerFields = `
  id
  displayName
  email
  numberOfOrders
`;

const customerFindQuery = `#graphql
query ShopifyStoreAgentCustomerFind($query: String!, $first: Int!) {
  customers(first: $first, query: $query) {
    nodes {
      ${customerFields}
    }
  }
}`;

const customerGetQuery = `#graphql
query ShopifyStoreAgentCustomerGet($id: ID!) {
  node(id: $id) {
    __typename
    ... on Customer {
      ${customerFields}
    }
  }
}`;

const fulfillmentGetQuery = `#graphql
query ShopifyStoreAgentFulfillmentGet($id: ID!) {
  node(id: $id) {
    __typename
    ... on Fulfillment {
      id
      status
      order {
        id
        name
      }
      trackingInfo {
        company
        number
        url
      }
    }
  }
}`;

const productFields = `
  id
  title
  handle
  status
  vendor
  productType
`;

const productGetByIdQuery = `#graphql
query ShopifyStoreAgentProductGetById($id: ID!) {
  node(id: $id) {
    __typename
    ... on Product {
      ${productFields}
    }
  }
}`;

const productGetByHandleQuery = `#graphql
query ShopifyStoreAgentProductGetByHandle($handle: String!) {
  productByHandle(handle: $handle) {
    ${productFields}
  }
}`;

const inventoryLevelFields = `
  id
  location {
    id
    name
  }
  quantities(names: ["available", "on_hand", "committed", "reserved", "incoming"]) {
    name
    quantity
  }
`;

const inventoryVariantFields = `
  id
  title
  sku
  product {
    id
    title
    handle
  }
`;

const inventoryItemFields = `
  id
  tracked
  sku
  variants(first: 5) {
    nodes {
      ${inventoryVariantFields}
    }
  }
  inventoryLevels(first: $levelsFirst) {
    nodes {
      ${inventoryLevelFields}
    }
  }
`;

const inventoryLookupByItemQuery = `#graphql
query ShopifyStoreAgentInventoryLookupByItem($id: ID!, $levelsFirst: Int!) {
  inventoryItem(id: $id) {
    ${inventoryItemFields}
  }
}`;

const inventoryLookupByVariantQuery = `#graphql
query ShopifyStoreAgentInventoryLookupByVariant($id: ID!, $levelsFirst: Int!) {
  node(id: $id) {
    __typename
    ... on ProductVariant {
      ${inventoryVariantFields}
      inventoryItem {
        id
        tracked
        sku
        inventoryLevels(first: $levelsFirst) {
          nodes {
            ${inventoryLevelFields}
          }
        }
      }
    }
  }
}`;

const inventoryLookupBySkuQuery = `#graphql
query ShopifyStoreAgentInventoryLookupBySku($query: String!, $first: Int!, $levelsFirst: Int!) {
  productVariants(first: $first, query: $query) {
    nodes {
      ${inventoryVariantFields}
      inventoryItem {
        id
        tracked
        sku
        inventoryLevels(first: $levelsFirst) {
          nodes {
            ${inventoryLevelFields}
          }
        }
      }
    }
  }
}`;

const inventoryLocationFields = `
  id
  name
  isActive
  fulfillsOnlineOrders
`;

const inventoryLocationGetQuery = `#graphql
query ShopifyStoreAgentLocationGet($id: ID!) {
  node(id: $id) {
    __typename
    ... on Location {
      ${inventoryLocationFields}
    }
  }
}`;

const inventoryLocationLookupQuery = `#graphql
query ShopifyStoreAgentLocationLookup($first: Int!, $query: String, $includeInactive: Boolean!, $includeLegacy: Boolean!) {
  locations(first: $first, query: $query, includeInactive: $includeInactive, includeLegacy: $includeLegacy) {
    nodes {
      ${inventoryLocationFields}
    }
  }
}`;
