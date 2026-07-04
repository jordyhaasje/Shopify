import type { StoreAgentConfig } from "./config.js";
import { ShopifyGraphqlClient, type FetchLike, type GraphqlUserError, type ShopifyGraphqlResult } from "./shopify-client.js";

export interface ProductCreateInput {
  title: string;
  descriptionHtml?: string;
  vendor?: string;
  productType?: string;
  status?: string;
  tags?: string[];
}

export interface ProductUpdateInput {
  id: string;
  title?: string;
  descriptionHtml?: string;
  vendor?: string;
  productType?: string;
  status?: string;
  tags?: string[];
}

export interface ProductVariantPriceInput {
  id: string;
  price: string;
}

export interface ProductVariantPriceUpdateInput {
  productId: string;
  variants: ProductVariantPriceInput[];
}

export interface ProductCreateSummary {
  id: string;
  title?: string;
  handle?: string;
  status?: string;
}

export interface ProductVariantPriceSummary {
  id: string;
  price?: string;
}

export interface ProductVariantPriceUpdateSummary {
  productId: string;
  updatedVariantCount: number;
  variants: ProductVariantPriceSummary[];
}

export interface ProductWriteDiagnostic {
  severity: "warning" | "error";
  code: string;
  message: string;
}

type ProductWriteStatus = "ok" | "blocked" | "missing_input" | "user_errors" | "shopify_error" | "invalid_response";

interface ProductWriteResultBase {
  ok: boolean;
  status: ProductWriteStatus;
  summary: string;
  product?: ProductCreateSummary;
  userErrors: GraphqlUserError[];
  diagnostics: ProductWriteDiagnostic[];
}

export interface ProductCreateResult extends ProductWriteResultBase {}

export interface ProductUpdateResult extends ProductWriteResultBase {}

export interface ProductVariantPriceUpdateResult extends ProductWriteResultBase {
  variantPriceUpdate?: ProductVariantPriceUpdateSummary;
}

export interface ProductWriteOptions {
  fetcher?: FetchLike;
}

interface ProductCreateData {
  productCreate?: {
    product?: {
      id?: unknown;
      title?: unknown;
      handle?: unknown;
      status?: unknown;
    } | null;
    userErrors?: GraphqlUserError[];
  } | null;
}

interface ProductUpdateData {
  productUpdate?: {
    product?: {
      id?: unknown;
      title?: unknown;
      handle?: unknown;
      status?: unknown;
    } | null;
    userErrors?: GraphqlUserError[];
  } | null;
}

interface ProductVariantsBulkUpdateData {
  productVariantsBulkUpdate?: {
    productVariants?: Array<{
      id?: unknown;
      price?: unknown;
    } | null> | null;
    userErrors?: GraphqlUserError[];
  } | null;
}

export async function createProduct(
  config: StoreAgentConfig,
  input: ProductCreateInput,
  options: ProductWriteOptions = {}
): Promise<ProductCreateResult> {
  if (config.readOnly) return blocked("Product create is blocked because read-only mode is enabled.");

  const title = safeText(input.title, 255);
  if (!title) return missingInput("Provide a product title.");

  const product: Record<string, unknown> = { title };
  const descriptionHtml = safeText(input.descriptionHtml, 5000);
  if (descriptionHtml) product.descriptionHtml = descriptionHtml;
  const vendor = safeText(input.vendor, 255);
  if (vendor) product.vendor = vendor;
  const productType = safeText(input.productType, 255);
  if (productType) product.productType = productType;
  const status = safeProductStatus(input.status);
  if (status) product.status = status;
  const tags = safeTags(input.tags);
  if (tags.length > 0) product.tags = tags;

  const client = new ShopifyGraphqlClient(config, options.fetcher);
  let result: ShopifyGraphqlResult<ProductCreateData>;
  try {
    result = await client.request<ProductCreateData>({
      query: productCreateMutation,
      variables: { product }
    });
  } catch {
    return shopifyFailure("Shopify product create request failed before a safe response was available.");
  }

  if (!result.ok) return mapGraphqlFailure(result);

  const userErrors = result.data.productCreate?.userErrors ?? result.userErrors;
  if (userErrors.length > 0) {
    return {
      ok: false,
      status: "user_errors",
      summary: "Shopify rejected the product create request.",
      userErrors: sanitizeUserErrors(userErrors),
      diagnostics: [{ severity: "warning", code: "shopify_user_errors", message: "Shopify returned product create user errors." }]
    };
  }

  const productNode = result.data.productCreate?.product;
  const id = safeText(productNode?.id, 180);
  if (!id) {
    return {
      ok: false,
      status: "invalid_response",
      summary: "Shopify product create response did not include a created product ID.",
      userErrors: [],
      diagnostics: [{ severity: "error", code: "invalid_response", message: "Shopify product create response did not include a created product ID." }]
    };
  }

  const created = {
    id,
    title: safeText(productNode?.title, 255),
    handle: safeHandle(productNode?.handle),
    status: safeProductStatus(productNode?.status)
  };
  return {
    ok: true,
    status: "ok",
    summary: `Created Shopify product "${created.title ?? created.handle ?? created.id}".`,
    product: created,
    userErrors: [],
    diagnostics: []
  };
}

export async function updateProduct(
  config: StoreAgentConfig,
  input: ProductUpdateInput,
  options: ProductWriteOptions = {}
): Promise<ProductUpdateResult> {
  if (config.readOnly) return blocked("Product update is blocked because read-only mode is enabled.");

  const id = safeText(input.id, 180);
  if (!id) return missingInput("Provide a product ID.");

  const product: Record<string, unknown> = { id };
  const title = safeText(input.title, 255);
  if (title) product.title = title;
  const descriptionHtml = safeText(input.descriptionHtml, 5000);
  if (descriptionHtml) product.descriptionHtml = descriptionHtml;
  const vendor = safeText(input.vendor, 255);
  if (vendor) product.vendor = vendor;
  const productType = safeText(input.productType, 255);
  if (productType) product.productType = productType;
  const status = safeProductStatus(input.status);
  if (status) product.status = status;
  const tags = safeTags(input.tags);
  if (tags.length > 0) product.tags = tags;

  if (Object.keys(product).length === 1) return missingInput("Provide at least one supported product update field.");

  const client = new ShopifyGraphqlClient(config, options.fetcher);
  let result: ShopifyGraphqlResult<ProductUpdateData>;
  try {
    result = await client.request<ProductUpdateData>({
      query: productUpdateMutation,
      variables: { product }
    });
  } catch {
    return shopifyFailure("Shopify product update request failed before a safe response was available.");
  }

  if (!result.ok) return mapGraphqlFailure(result);

  const userErrors = result.data.productUpdate?.userErrors ?? result.userErrors;
  if (userErrors.length > 0) {
    return {
      ok: false,
      status: "user_errors",
      summary: "Shopify rejected the product update request.",
      userErrors: sanitizeUserErrors(userErrors),
      diagnostics: [{ severity: "warning", code: "shopify_user_errors", message: "Shopify returned product update user errors." }]
    };
  }

  const productNode = result.data.productUpdate?.product;
  const updatedId = safeText(productNode?.id, 180);
  if (!updatedId) {
    return {
      ok: false,
      status: "invalid_response",
      summary: "Shopify product update response did not include an updated product ID.",
      userErrors: [],
      diagnostics: [{ severity: "error", code: "invalid_response", message: "Shopify product update response did not include an updated product ID." }]
    };
  }

  const updated = {
    id: updatedId,
    title: safeText(productNode?.title, 255),
    handle: safeHandle(productNode?.handle),
    status: safeProductStatus(productNode?.status)
  };
  return {
    ok: true,
    status: "ok",
    summary: `Updated Shopify product "${updated.title ?? updated.handle ?? updated.id}".`,
    product: updated,
    userErrors: [],
    diagnostics: []
  };
}

export async function updateProductVariantPrices(
  config: StoreAgentConfig,
  input: ProductVariantPriceUpdateInput,
  options: ProductWriteOptions = {}
): Promise<ProductVariantPriceUpdateResult> {
  if (config.readOnly) return blocked("Product variant price update is blocked because read-only mode is enabled.");

  const productId = safeText(input.productId, 180);
  if (!productId) return missingInput("Provide a product ID.");

  const variants = safeVariantPriceInputs(input.variants);
  if (variants.length === 0) return missingInput("Provide at least one variant ID and non-negative price.");

  const client = new ShopifyGraphqlClient(config, options.fetcher);
  let result: ShopifyGraphqlResult<ProductVariantsBulkUpdateData>;
  try {
    result = await client.request<ProductVariantsBulkUpdateData>({
      query: productVariantsBulkUpdateMutation,
      variables: { productId, variants }
    });
  } catch {
    return shopifyFailure("Shopify product variant price update request failed before a safe response was available.");
  }

  if (!result.ok) return mapGraphqlFailure(result);

  const userErrors = result.data.productVariantsBulkUpdate?.userErrors ?? result.userErrors;
  if (userErrors.length > 0) {
    return {
      ok: false,
      status: "user_errors",
      summary: "Shopify rejected the product variant price update request.",
      userErrors: sanitizeUserErrors(userErrors),
      diagnostics: [{ severity: "warning", code: "shopify_user_errors", message: "Shopify returned product variant price update user errors." }]
    };
  }

  const updatedVariants: ProductVariantPriceSummary[] = [];
  for (const variant of result.data.productVariantsBulkUpdate?.productVariants ?? []) {
    const id = safeText(variant?.id, 180);
    if (!id) continue;
    updatedVariants.push({ id, price: safePrice(variant?.price) });
    if (updatedVariants.length >= variants.length) break;
  }

  if (updatedVariants.length === 0) {
    return {
      ok: false,
      status: "invalid_response",
      summary: "Shopify product variant price update response did not include updated variant IDs.",
      userErrors: [],
      diagnostics: [{ severity: "error", code: "invalid_response", message: "Shopify product variant price update response did not include updated variant IDs." }]
    };
  }

  return {
    ok: true,
    status: "ok",
    summary: `Updated ${updatedVariants.length} Shopify product variant price${updatedVariants.length === 1 ? "" : "s"}.`,
    variantPriceUpdate: {
      productId,
      updatedVariantCount: updatedVariants.length,
      variants: updatedVariants
    },
    userErrors: [],
    diagnostics: []
  };
}

const productCreateMutation = /* GraphQL */ `
  mutation ShopifyStoreAgentProductCreate($product: ProductCreateInput!) {
    productCreate(product: $product) {
      product {
        id
        title
        handle
        status
      }
      userErrors {
        field
        message
      }
    }
  }
`;

const productUpdateMutation = /* GraphQL */ `
  mutation ShopifyStoreAgentProductUpdate($product: ProductUpdateInput!) {
    productUpdate(product: $product) {
      product {
        id
        title
        handle
        status
      }
      userErrors {
        field
        message
      }
    }
  }
`;

const productVariantsBulkUpdateMutation = /* GraphQL */ `
  mutation ShopifyStoreAgentProductVariantPricesUpdate($productId: ID!, $variants: [ProductVariantsBulkInput!]!) {
    productVariantsBulkUpdate(productId: $productId, variants: $variants) {
      productVariants {
        id
        price
      }
      userErrors {
        field
        message
      }
    }
  }
`;

function mapGraphqlFailure(result: Extract<ShopifyGraphqlResult<ProductCreateData | ProductUpdateData | ProductVariantsBulkUpdateData>, { ok: false }>): ProductWriteResultBase {
  return {
    ok: false,
    status: "shopify_error",
    summary: result.error.message,
    userErrors: sanitizeUserErrors(result.userErrors),
    diagnostics: [{
      severity: result.error.accessDenied ? "error" : "warning",
      code: result.error.type,
      message: result.error.message
    }]
  };
}

function missingInput(message: string): ProductWriteResultBase {
  return {
    ok: false,
    status: "missing_input",
    summary: message,
    userErrors: [],
    diagnostics: [{ severity: "warning", code: "missing_input", message }]
  };
}

function blocked(message: string): ProductWriteResultBase {
  return {
    ok: false,
    status: "blocked",
    summary: message,
    userErrors: [],
    diagnostics: [{ severity: "warning", code: "read_only", message }]
  };
}

function shopifyFailure(message: string): ProductWriteResultBase {
  return {
    ok: false,
    status: "shopify_error",
    summary: message,
    userErrors: [],
    diagnostics: [{ severity: "warning", code: "shopify_request_failed", message }]
  };
}

function sanitizeUserErrors(userErrors: GraphqlUserError[]): GraphqlUserError[] {
  return userErrors.slice(0, 10).map((error) => ({
    field: Array.isArray(error.field) ? error.field.map((field) => safeText(field, 80) ?? "[redacted]") : undefined,
    message: safeText(error.message, 255) ?? "Shopify returned a product write user error."
  }));
}

function safeTags(value: string[] | undefined): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((tag) => safeText(tag, 80)).filter((tag): tag is string => Boolean(tag)).slice(0, 20);
}

function safeVariantPriceInputs(value: ProductVariantPriceInput[] | undefined): ProductVariantPriceInput[] {
  if (!Array.isArray(value)) return [];
  const results: ProductVariantPriceInput[] = [];
  for (const item of value) {
    const id = safeText(item?.id, 180);
    const price = safePrice(item?.price);
    if (id && price !== undefined) results.push({ id, price });
    if (results.length >= 25) break;
  }
  return results;
}

function safePrice(value: unknown): string | undefined {
  if (typeof value === "number" && Number.isFinite(value) && value >= 0) return value.toFixed(2);
  if (typeof value !== "string" || !value.trim()) return undefined;
  if (looksLikeSecret(value)) return undefined;
  const normalized = value.trim();
  if (!/^\d+(\.\d{1,2})?$/.test(normalized)) return undefined;
  return normalized;
}

function safeProductStatus(value: unknown): string | undefined {
  if (typeof value !== "string" || !value.trim()) return undefined;
  const normalized = value.trim().toUpperCase();
  return ["ACTIVE", "DRAFT", "ARCHIVED"].includes(normalized) ? normalized : undefined;
}

function safeText(value: unknown, maxLength: number): string | undefined {
  if (typeof value !== "string" || !value.trim()) return undefined;
  if (looksLikeSecret(value)) return "[redacted]";
  const normalized = value.trim();
  return normalized.length > maxLength ? `${normalized.slice(0, maxLength)}...` : normalized;
}

function safeHandle(value: unknown): string | undefined {
  const text = safeText(value, 180);
  if (!text) return undefined;
  return /^[a-z0-9][a-z0-9-]*$/i.test(text) ? text : undefined;
}

function looksLikeSecret(value: string): boolean {
  return /shpat_[A-Za-z0-9_]+|shpua_[A-Za-z0-9_]+|ghp_[A-Za-z0-9_]+|Bearer\s+[A-Za-z0-9._-]+/i.test(value);
}
