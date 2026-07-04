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

export interface ProductVariantOptionValueInput {
  optionName: string;
  name: string;
}

export interface ProductVariantCreateInput {
  optionValues: ProductVariantOptionValueInput[];
  price?: string;
  sku?: string;
}

export interface ProductVariantBulkCreateInput {
  productId: string;
  variants: ProductVariantCreateInput[];
}

export interface ProductOptionCreateInput {
  name: string;
  values: string[];
}

export interface ProductOptionsCreateInput {
  productId: string;
  options: ProductOptionCreateInput[];
}

export interface ProductOptionUpdateInput {
  id: string;
  name: string;
}

export interface ProductOptionRenameInput {
  productId: string;
  option: ProductOptionUpdateInput;
}

export interface ProductOptionValueUpdateInput {
  id: string;
  name: string;
}

export interface ProductOptionValueCreateInput {
  name: string;
}

export interface ProductOptionValueRenameInput {
  productId: string;
  optionId: string;
  value: ProductOptionValueUpdateInput;
}

export interface ProductOptionValueAddInput {
  productId: string;
  optionId: string;
  values: ProductOptionValueCreateInput[];
}

export interface ProductOptionValueDeleteInput {
  productId: string;
  optionId: string;
  valueIds: string[];
}

export interface ProductOptionsDeleteInput {
  productId: string;
  optionIds: string[];
}

export interface ProductOptionReorderValueInput {
  id?: string;
  name?: string;
}

export interface ProductOptionReorderInput {
  id?: string;
  name?: string;
  values?: ProductOptionReorderValueInput[];
}

export interface ProductOptionsReorderInput {
  productId: string;
  options: ProductOptionReorderInput[];
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

export interface ProductVariantCreateSummary {
  id: string;
  title?: string;
  price?: string;
  sku?: string;
}

export interface ProductVariantBulkCreateSummary {
  productId: string;
  createdVariantCount: number;
  variants: ProductVariantCreateSummary[];
}

export interface ProductOptionSummary {
  id?: string;
  name: string;
  position?: number;
  values: string[];
}

export interface ProductOptionsCreateSummary {
  productId: string;
  createdOptionCount: number;
  options: ProductOptionSummary[];
  variantStrategy: "LEAVE_AS_IS";
}

export interface ProductOptionRenameSummary {
  productId: string;
  option: ProductOptionSummary;
  variantStrategy: "LEAVE_AS_IS";
}

export interface ProductOptionValueSummary {
  id: string;
  name: string;
}

export interface ProductOptionValueRenameSummary {
  productId: string;
  optionId: string;
  value: ProductOptionValueSummary;
  variantStrategy: "LEAVE_AS_IS";
}

export interface ProductOptionValueAddSummary {
  productId: string;
  optionId: string;
  addedValueCount: number;
  values: ProductOptionValueSummary[];
  variantStrategy: "LEAVE_AS_IS";
}

export interface ProductOptionValueDeleteSummary {
  productId: string;
  optionId: string;
  deletedValueCount: number;
  valueIds: string[];
  remainingValues: ProductOptionValueSummary[];
  variantStrategy: "LEAVE_AS_IS";
}

export interface ProductOptionsDeleteSummary {
  productId: string;
  deletedOptionCount: number;
  optionIds: string[];
  remainingOptions: ProductOptionSummary[];
  strategy: "NON_DESTRUCTIVE";
}

export interface ProductOptionsReorderSummary {
  productId: string;
  reorderedOptionCount: number;
  options: ProductOptionSummary[];
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

export interface ProductVariantBulkCreateResult extends ProductWriteResultBase {
  variantCreate?: ProductVariantBulkCreateSummary;
}

export interface ProductOptionsCreateResult extends ProductWriteResultBase {
  optionCreate?: ProductOptionsCreateSummary;
}

export interface ProductOptionRenameResult extends ProductWriteResultBase {
  optionRename?: ProductOptionRenameSummary;
}

export interface ProductOptionValueRenameResult extends ProductWriteResultBase {
  optionValueRename?: ProductOptionValueRenameSummary;
}

export interface ProductOptionValueAddResult extends ProductWriteResultBase {
  optionValueAdd?: ProductOptionValueAddSummary;
}

export interface ProductOptionValueDeleteResult extends ProductWriteResultBase {
  optionValueDelete?: ProductOptionValueDeleteSummary;
}

export interface ProductOptionsDeleteResult extends ProductWriteResultBase {
  optionDelete?: ProductOptionsDeleteSummary;
}

export interface ProductOptionsReorderResult extends ProductWriteResultBase {
  optionReorder?: ProductOptionsReorderSummary;
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

interface ProductVariantsBulkCreateData {
  productVariantsBulkCreate?: {
    productVariants?: Array<{
      id?: unknown;
      title?: unknown;
      price?: unknown;
      sku?: unknown;
    } | null> | null;
    userErrors?: GraphqlUserError[];
  } | null;
}

type ProductOptionSummaryNode = {
  id?: unknown;
  name?: unknown;
  position?: unknown;
  optionValues?: Array<{
    id?: unknown;
    name?: unknown;
    hasVariants?: unknown;
  } | null> | null;
};

interface ProductOptionsCreateData {
  productOptionsCreate?: {
    product?: {
      id?: unknown;
      options?: Array<ProductOptionSummaryNode | null> | null;
    } | null;
    userErrors?: GraphqlUserError[];
  } | null;
}

interface ProductOptionsDeleteData {
  productOptionsDelete?: {
    deletedOptionsIds?: unknown[] | null;
    product?: {
      id?: unknown;
      options?: Array<ProductOptionSummaryNode | null> | null;
    } | null;
    userErrors?: GraphqlUserError[];
  } | null;
}

interface ProductOptionsReorderData {
  productOptionsReorder?: {
    product?: {
      id?: unknown;
      options?: Array<ProductOptionSummaryNode | null> | null;
    } | null;
    userErrors?: GraphqlUserError[];
  } | null;
}

interface ProductOptionUpdateData {
  productOptionUpdate?: {
    product?: {
      id?: unknown;
      options?: Array<ProductOptionSummaryNode | null> | null;
    } | null;
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

export async function createProductVariants(
  config: StoreAgentConfig,
  input: ProductVariantBulkCreateInput,
  options: ProductWriteOptions = {}
): Promise<ProductVariantBulkCreateResult> {
  if (config.readOnly) return blocked("Product variant create is blocked because read-only mode is enabled.");

  const productId = safeText(input.productId, 180);
  if (!productId) return missingInput("Provide a product ID.");

  const variants = safeVariantCreateInputs(input.variants);
  if (variants.length === 0) return missingInput("Provide at least one variant with explicit option values.");

  const client = new ShopifyGraphqlClient(config, options.fetcher);
  let result: ShopifyGraphqlResult<ProductVariantsBulkCreateData>;
  try {
    result = await client.request<ProductVariantsBulkCreateData>({
      query: productVariantsBulkCreateMutation,
      variables: { productId, variants }
    });
  } catch {
    return shopifyFailure("Shopify product variant create request failed before a safe response was available.");
  }

  if (!result.ok) return mapGraphqlFailure(result);

  const userErrors = result.data.productVariantsBulkCreate?.userErrors ?? result.userErrors;
  if (userErrors.length > 0) {
    return {
      ok: false,
      status: "user_errors",
      summary: "Shopify rejected the product variant create request.",
      userErrors: sanitizeUserErrors(userErrors),
      diagnostics: [{ severity: "warning", code: "shopify_user_errors", message: "Shopify returned product variant create user errors." }]
    };
  }

  const createdVariants: ProductVariantCreateSummary[] = [];
  for (const variant of result.data.productVariantsBulkCreate?.productVariants ?? []) {
    const id = safeText(variant?.id, 180);
    if (!id) continue;
    createdVariants.push({
      id,
      title: safeText(variant?.title, 255),
      price: safePrice(variant?.price),
      sku: safeText(variant?.sku, 120)
    });
    if (createdVariants.length >= variants.length) break;
  }

  if (createdVariants.length === 0) {
    return {
      ok: false,
      status: "invalid_response",
      summary: "Shopify product variant create response did not include created variant IDs.",
      userErrors: [],
      diagnostics: [{ severity: "error", code: "invalid_response", message: "Shopify product variant create response did not include created variant IDs." }]
    };
  }

  return {
    ok: true,
    status: "ok",
    summary: `Created ${createdVariants.length} Shopify product variant${createdVariants.length === 1 ? "" : "s"}.`,
    variantCreate: {
      productId,
      createdVariantCount: createdVariants.length,
      variants: createdVariants
    },
    userErrors: [],
    diagnostics: []
  };
}

export async function createProductOptions(
  config: StoreAgentConfig,
  input: ProductOptionsCreateInput,
  options: ProductWriteOptions = {}
): Promise<ProductOptionsCreateResult> {
  if (config.readOnly) return blocked("Product option create is blocked because read-only mode is enabled.");

  const productId = safeText(input.productId, 180);
  if (!productId) return missingInput("Provide a product ID.");

  const productOptions = safeOptionCreateInputs(input.options);
  if (productOptions.length === 0) return missingInput("Provide at least one option name with explicit values.");

  const client = new ShopifyGraphqlClient(config, options.fetcher);
  let result: ShopifyGraphqlResult<ProductOptionsCreateData>;
  try {
    result = await client.request<ProductOptionsCreateData>({
      query: productOptionsCreateMutation,
      variables: {
        productId,
        options: productOptions.map((option) => ({
          name: option.name,
          values: option.values.map((name) => ({ name }))
        })),
        variantStrategy: "LEAVE_AS_IS"
      }
    });
  } catch {
    return shopifyFailure("Shopify product option create request failed before a safe response was available.");
  }

  if (!result.ok) return mapGraphqlFailure(result);

  const userErrors = result.data.productOptionsCreate?.userErrors ?? result.userErrors;
  if (userErrors.length > 0) {
    return {
      ok: false,
      status: "user_errors",
      summary: "Shopify rejected the product option create request.",
      userErrors: sanitizeUserErrors(userErrors),
      diagnostics: [{ severity: "warning", code: "shopify_user_errors", message: "Shopify returned product option create user errors." }]
    };
  }

  const productNode = result.data.productOptionsCreate?.product;
  const updatedProductId = safeText(productNode?.id, 180);
  if (!updatedProductId) {
    return {
      ok: false,
      status: "invalid_response",
      summary: "Shopify product option create response did not include a product ID.",
      userErrors: [],
      diagnostics: [{ severity: "error", code: "invalid_response", message: "Shopify product option create response did not include a product ID." }]
    };
  }

  const requestedNames = new Set(productOptions.map((option) => option.name));
  const createdOptions: ProductOptionSummary[] = [];
  for (const option of productNode?.options ?? []) {
    const name = safeNonSecretText(option?.name, 120);
    if (!name || !requestedNames.has(name)) continue;
    const values = safeOptionValueNames((option?.optionValues ?? []).map((value) => value?.name));
    createdOptions.push({
      id: safeText(option?.id, 180),
      name,
      position: safePosition(option?.position),
      values
    });
    if (createdOptions.length >= productOptions.length) break;
  }

  if (createdOptions.length === 0) {
    return {
      ok: false,
      status: "invalid_response",
      summary: "Shopify product option create response did not include created option summaries.",
      userErrors: [],
      diagnostics: [{ severity: "error", code: "invalid_response", message: "Shopify product option create response did not include created option summaries." }]
    };
  }

  return {
    ok: true,
    status: "ok",
    summary: `Created ${createdOptions.length} Shopify product option${createdOptions.length === 1 ? "" : "s"}.`,
    optionCreate: {
      productId: updatedProductId,
      createdOptionCount: createdOptions.length,
      options: createdOptions,
      variantStrategy: "LEAVE_AS_IS"
    },
    userErrors: [],
    diagnostics: []
  };
}

export async function deleteProductOptions(
  config: StoreAgentConfig,
  input: ProductOptionsDeleteInput,
  options: ProductWriteOptions = {}
): Promise<ProductOptionsDeleteResult> {
  if (config.readOnly) return blocked("Product option delete is blocked because read-only mode is enabled.");

  const productId = safeText(input.productId, 180);
  if (!productId) return missingInput("Provide a product ID.");

  const optionIds = safeOptionIds(input.optionIds);
  if (optionIds.length === 0) return missingInput("Provide at least one product option ID to delete.");

  const client = new ShopifyGraphqlClient(config, options.fetcher);
  let result: ShopifyGraphqlResult<ProductOptionsDeleteData>;
  try {
    result = await client.request<ProductOptionsDeleteData>({
      query: productOptionsDeleteMutation,
      variables: {
        productId,
        options: optionIds,
        strategy: "NON_DESTRUCTIVE"
      }
    });
  } catch {
    return shopifyFailure("Shopify product option delete request failed before a safe response was available.");
  }

  if (!result.ok) return mapGraphqlFailure(result);

  const userErrors = result.data.productOptionsDelete?.userErrors ?? result.userErrors;
  if (userErrors.length > 0) {
    return {
      ok: false,
      status: "user_errors",
      summary: "Shopify rejected the product option delete request.",
      userErrors: sanitizeUserErrors(userErrors),
      diagnostics: [{ severity: "warning", code: "shopify_user_errors", message: "Shopify returned product option delete user errors." }]
    };
  }

  const productNode = result.data.productOptionsDelete?.product;
  const updatedProductId = safeText(productNode?.id, 180);
  if (!updatedProductId) {
    return {
      ok: false,
      status: "invalid_response",
      summary: "Shopify product option delete response did not include a product ID.",
      userErrors: [],
      diagnostics: [{ severity: "error", code: "invalid_response", message: "Shopify product option delete response did not include a product ID." }]
    };
  }

  const returnedDeletedIds = safeOptionIds((result.data.productOptionsDelete?.deletedOptionsIds ?? []).map((id) => safeText(id, 180) ?? ""));
  if (optionIds.some((optionId) => !returnedDeletedIds.includes(optionId))) {
    return {
      ok: false,
      status: "invalid_response",
      summary: "Shopify product option delete response did not include all deleted option IDs.",
      userErrors: [],
      diagnostics: [{ severity: "error", code: "invalid_response", message: "Shopify product option delete response did not include all deleted option IDs." }]
    };
  }

  const remainingOptions = (productNode?.options ?? [])
    .map((candidate) => optionSummaryFromNode(candidate))
    .filter((option): option is ProductOptionSummary => Boolean(option))
    .slice(0, 10);
  const remainingIds = new Set(remainingOptions.map((option) => option.id).filter(Boolean));
  if (optionIds.some((optionId) => remainingIds.has(optionId))) {
    return {
      ok: false,
      status: "invalid_response",
      summary: "Shopify product option delete response still included a deleted option ID.",
      userErrors: [],
      diagnostics: [{ severity: "error", code: "invalid_response", message: "Shopify product option delete response still included a deleted option ID." }]
    };
  }

  return {
    ok: true,
    status: "ok",
    summary: `Deleted ${optionIds.length} Shopify product option${optionIds.length === 1 ? "" : "s"}.`,
    optionDelete: {
      productId: updatedProductId,
      deletedOptionCount: optionIds.length,
      optionIds,
      remainingOptions,
      strategy: "NON_DESTRUCTIVE"
    },
    userErrors: [],
    diagnostics: []
  };
}

export async function reorderProductOptions(
  config: StoreAgentConfig,
  input: ProductOptionsReorderInput,
  options: ProductWriteOptions = {}
): Promise<ProductOptionsReorderResult> {
  if (config.readOnly) return blocked("Product option reorder is blocked because read-only mode is enabled.");

  const productId = safeText(input.productId, 180);
  if (!productId) return missingInput("Provide a product ID.");

  const optionOrder = safeOptionReorderInputs(input.options);
  if (optionOrder.length < 2) return missingInput("Provide at least two explicit product options in the desired order.");

  const client = new ShopifyGraphqlClient(config, options.fetcher);
  let result: ShopifyGraphqlResult<ProductOptionsReorderData>;
  try {
    result = await client.request<ProductOptionsReorderData>({
      query: productOptionsReorderMutation,
      variables: {
        productId,
        options: optionOrder
      }
    });
  } catch {
    return shopifyFailure("Shopify product option reorder request failed before a safe response was available.");
  }

  if (!result.ok) return mapGraphqlFailure(result);

  const userErrors = result.data.productOptionsReorder?.userErrors ?? result.userErrors;
  if (userErrors.length > 0) {
    return {
      ok: false,
      status: "user_errors",
      summary: "Shopify rejected the product option reorder request.",
      userErrors: sanitizeUserErrors(userErrors),
      diagnostics: [{ severity: "warning", code: "shopify_user_errors", message: "Shopify returned product option reorder user errors." }]
    };
  }

  const productNode = result.data.productOptionsReorder?.product;
  const updatedProductId = safeText(productNode?.id, 180);
  if (!updatedProductId) {
    return {
      ok: false,
      status: "invalid_response",
      summary: "Shopify product option reorder response did not include a product ID.",
      userErrors: [],
      diagnostics: [{ severity: "error", code: "invalid_response", message: "Shopify product option reorder response did not include a product ID." }]
    };
  }

  const reorderedOptions = (productNode?.options ?? [])
    .map((candidate) => optionSummaryFromNode(candidate))
    .filter((option): option is ProductOptionSummary => Boolean(option))
    .slice(0, 10);
  const returnedOrder = reorderedOptions.slice(0, optionOrder.length);
  if (returnedOrder.length < optionOrder.length || optionOrder.some((requested, index) => !optionMatchesRequested(returnedOrder[index], requested))) {
    return {
      ok: false,
      status: "invalid_response",
      summary: "Shopify product option reorder response did not reflect the requested option order.",
      userErrors: [],
      diagnostics: [{ severity: "error", code: "invalid_response", message: "Shopify product option reorder response did not reflect the requested option order." }]
    };
  }

  return {
    ok: true,
    status: "ok",
    summary: `Reordered ${optionOrder.length} Shopify product option${optionOrder.length === 1 ? "" : "s"}.`,
    optionReorder: {
      productId: updatedProductId,
      reorderedOptionCount: optionOrder.length,
      options: reorderedOptions
    },
    userErrors: [],
    diagnostics: []
  };
}

export async function renameProductOption(
  config: StoreAgentConfig,
  input: ProductOptionRenameInput,
  options: ProductWriteOptions = {}
): Promise<ProductOptionRenameResult> {
  if (config.readOnly) return blocked("Product option rename is blocked because read-only mode is enabled.");

  const productId = safeText(input.productId, 180);
  if (!productId) return missingInput("Provide a product ID.");

  const option = safeOptionUpdateInput(input.option);
  if (!option) return missingInput("Provide an option ID and new option name.");

  const client = new ShopifyGraphqlClient(config, options.fetcher);
  let result: ShopifyGraphqlResult<ProductOptionUpdateData>;
  try {
    result = await client.request<ProductOptionUpdateData>({
      query: productOptionUpdateMutation,
      variables: {
        productId,
        option,
        variantStrategy: "LEAVE_AS_IS"
      }
    });
  } catch {
    return shopifyFailure("Shopify product option rename request failed before a safe response was available.");
  }

  if (!result.ok) return mapGraphqlFailure(result);

  const userErrors = result.data.productOptionUpdate?.userErrors ?? result.userErrors;
  if (userErrors.length > 0) {
    return {
      ok: false,
      status: "user_errors",
      summary: "Shopify rejected the product option rename request.",
      userErrors: sanitizeUserErrors(userErrors),
      diagnostics: [{ severity: "warning", code: "shopify_user_errors", message: "Shopify returned product option rename user errors." }]
    };
  }

  const productNode = result.data.productOptionUpdate?.product;
  const updatedProductId = safeText(productNode?.id, 180);
  if (!updatedProductId) {
    return {
      ok: false,
      status: "invalid_response",
      summary: "Shopify product option rename response did not include a product ID.",
      userErrors: [],
      diagnostics: [{ severity: "error", code: "invalid_response", message: "Shopify product option rename response did not include a product ID." }]
    };
  }

  const renamedOption = productNode?.options?.find((candidate) => safeText(candidate?.id, 180) === option.id);
  const optionSummary = optionSummaryFromNode(renamedOption);
  if (!optionSummary) {
    return {
      ok: false,
      status: "invalid_response",
      summary: "Shopify product option rename response did not include the renamed option summary.",
      userErrors: [],
      diagnostics: [{ severity: "error", code: "invalid_response", message: "Shopify product option rename response did not include the renamed option summary." }]
    };
  }

  return {
    ok: true,
    status: "ok",
    summary: "Renamed 1 Shopify product option.",
    optionRename: {
      productId: updatedProductId,
      option: optionSummary,
      variantStrategy: "LEAVE_AS_IS"
    },
    userErrors: [],
    diagnostics: []
  };
}

export async function renameProductOptionValue(
  config: StoreAgentConfig,
  input: ProductOptionValueRenameInput,
  options: ProductWriteOptions = {}
): Promise<ProductOptionValueRenameResult> {
  if (config.readOnly) return blocked("Product option value rename is blocked because read-only mode is enabled.");

  const productId = safeText(input.productId, 180);
  if (!productId) return missingInput("Provide a product ID.");

  const optionId = safeText(input.optionId, 180);
  const value = safeOptionValueUpdateInput(input.value);
  if (!optionId || !value) return missingInput("Provide an option ID, option value ID, and new option value name.");

  const client = new ShopifyGraphqlClient(config, options.fetcher);
  let result: ShopifyGraphqlResult<ProductOptionUpdateData>;
  try {
    result = await client.request<ProductOptionUpdateData>({
      query: productOptionUpdateMutation,
      variables: {
        productId,
        option: { id: optionId },
        optionValuesToUpdate: [value],
        variantStrategy: "LEAVE_AS_IS"
      }
    });
  } catch {
    return shopifyFailure("Shopify product option value rename request failed before a safe response was available.");
  }

  if (!result.ok) return mapGraphqlFailure(result);

  const userErrors = result.data.productOptionUpdate?.userErrors ?? result.userErrors;
  if (userErrors.length > 0) {
    return {
      ok: false,
      status: "user_errors",
      summary: "Shopify rejected the product option value rename request.",
      userErrors: sanitizeUserErrors(userErrors),
      diagnostics: [{ severity: "warning", code: "shopify_user_errors", message: "Shopify returned product option value rename user errors." }]
    };
  }

  const productNode = result.data.productOptionUpdate?.product;
  const updatedProductId = safeText(productNode?.id, 180);
  if (!updatedProductId) {
    return {
      ok: false,
      status: "invalid_response",
      summary: "Shopify product option value rename response did not include a product ID.",
      userErrors: [],
      diagnostics: [{ severity: "error", code: "invalid_response", message: "Shopify product option value rename response did not include a product ID." }]
    };
  }

  const optionNode = productNode?.options?.find((candidate) => safeText(candidate?.id, 180) === optionId);
  const valueNode = optionNode?.optionValues?.find((candidate) => safeText(candidate?.id, 180) === value.id);
  const valueSummary = optionValueSummaryFromNode(valueNode);
  if (!valueSummary) {
    return {
      ok: false,
      status: "invalid_response",
      summary: "Shopify product option value rename response did not include the renamed option value summary.",
      userErrors: [],
      diagnostics: [{ severity: "error", code: "invalid_response", message: "Shopify product option value rename response did not include the renamed option value summary." }]
    };
  }

  return {
    ok: true,
    status: "ok",
    summary: "Renamed 1 Shopify product option value.",
    optionValueRename: {
      productId: updatedProductId,
      optionId,
      value: valueSummary,
      variantStrategy: "LEAVE_AS_IS"
    },
    userErrors: [],
    diagnostics: []
  };
}

export async function addProductOptionValues(
  config: StoreAgentConfig,
  input: ProductOptionValueAddInput,
  options: ProductWriteOptions = {}
): Promise<ProductOptionValueAddResult> {
  if (config.readOnly) return blocked("Product option value add is blocked because read-only mode is enabled.");

  const productId = safeText(input.productId, 180);
  if (!productId) return missingInput("Provide a product ID.");

  const optionId = safeText(input.optionId, 180);
  const values = safeOptionValueCreateInputs(input.values);
  if (!optionId || values.length === 0) return missingInput("Provide an option ID and at least one new option value name.");

  const client = new ShopifyGraphqlClient(config, options.fetcher);
  let result: ShopifyGraphqlResult<ProductOptionUpdateData>;
  try {
    result = await client.request<ProductOptionUpdateData>({
      query: productOptionUpdateMutation,
      variables: {
        productId,
        option: { id: optionId },
        optionValuesToAdd: values,
        variantStrategy: "LEAVE_AS_IS"
      }
    });
  } catch {
    return shopifyFailure("Shopify product option value add request failed before a safe response was available.");
  }

  if (!result.ok) return mapGraphqlFailure(result);

  const userErrors = result.data.productOptionUpdate?.userErrors ?? result.userErrors;
  if (userErrors.length > 0) {
    return {
      ok: false,
      status: "user_errors",
      summary: "Shopify rejected the product option value add request.",
      userErrors: sanitizeUserErrors(userErrors),
      diagnostics: [{ severity: "warning", code: "shopify_user_errors", message: "Shopify returned product option value add user errors." }]
    };
  }

  const productNode = result.data.productOptionUpdate?.product;
  const updatedProductId = safeText(productNode?.id, 180);
  if (!updatedProductId) {
    return {
      ok: false,
      status: "invalid_response",
      summary: "Shopify product option value add response did not include a product ID.",
      userErrors: [],
      diagnostics: [{ severity: "error", code: "invalid_response", message: "Shopify product option value add response did not include a product ID." }]
    };
  }

  const optionNode = productNode?.options?.find((candidate) => safeText(candidate?.id, 180) === optionId);
  const expectedNames = new Set(values.map((value) => value.name));
  const valueSummaries = (optionNode?.optionValues ?? [])
    .map((candidate) => optionValueSummaryFromNode(candidate))
    .filter((value): value is ProductOptionValueSummary => Boolean(value && expectedNames.has(value.name)))
    .slice(0, values.length);
  if (valueSummaries.length !== values.length) {
    return {
      ok: false,
      status: "invalid_response",
      summary: "Shopify product option value add response did not include all added option value summaries.",
      userErrors: [],
      diagnostics: [{ severity: "error", code: "invalid_response", message: "Shopify product option value add response did not include all added option value summaries." }]
    };
  }

  return {
    ok: true,
    status: "ok",
    summary: `Added ${valueSummaries.length} Shopify product option value${valueSummaries.length === 1 ? "" : "s"}.`,
    optionValueAdd: {
      productId: updatedProductId,
      optionId,
      addedValueCount: valueSummaries.length,
      values: valueSummaries,
      variantStrategy: "LEAVE_AS_IS"
    },
    userErrors: [],
    diagnostics: []
  };
}

export async function deleteProductOptionValues(
  config: StoreAgentConfig,
  input: ProductOptionValueDeleteInput,
  options: ProductWriteOptions = {}
): Promise<ProductOptionValueDeleteResult> {
  if (config.readOnly) return blocked("Product option value delete is blocked because read-only mode is enabled.");

  const productId = safeText(input.productId, 180);
  if (!productId) return missingInput("Provide a product ID.");

  const optionId = safeText(input.optionId, 180);
  const valueIds = safeOptionValueIds(input.valueIds);
  if (!optionId || valueIds.length === 0) return missingInput("Provide an option ID and at least one option value ID to delete.");

  const client = new ShopifyGraphqlClient(config, options.fetcher);
  let result: ShopifyGraphqlResult<ProductOptionUpdateData>;
  try {
    result = await client.request<ProductOptionUpdateData>({
      query: productOptionUpdateMutation,
      variables: {
        productId,
        option: { id: optionId },
        optionValuesToDelete: valueIds,
        variantStrategy: "LEAVE_AS_IS"
      }
    });
  } catch {
    return shopifyFailure("Shopify product option value delete request failed before a safe response was available.");
  }

  if (!result.ok) return mapGraphqlFailure(result);

  const userErrors = result.data.productOptionUpdate?.userErrors ?? result.userErrors;
  if (userErrors.length > 0) {
    return {
      ok: false,
      status: "user_errors",
      summary: "Shopify rejected the product option value delete request.",
      userErrors: sanitizeUserErrors(userErrors),
      diagnostics: [{ severity: "warning", code: "shopify_user_errors", message: "Shopify returned product option value delete user errors." }]
    };
  }

  const productNode = result.data.productOptionUpdate?.product;
  const updatedProductId = safeText(productNode?.id, 180);
  if (!updatedProductId) {
    return {
      ok: false,
      status: "invalid_response",
      summary: "Shopify product option value delete response did not include a product ID.",
      userErrors: [],
      diagnostics: [{ severity: "error", code: "invalid_response", message: "Shopify product option value delete response did not include a product ID." }]
    };
  }

  const optionNode = productNode?.options?.find((candidate) => safeText(candidate?.id, 180) === optionId);
  if (!optionNode) {
    return {
      ok: false,
      status: "invalid_response",
      summary: "Shopify product option value delete response did not include the updated option summary.",
      userErrors: [],
      diagnostics: [{ severity: "error", code: "invalid_response", message: "Shopify product option value delete response did not include the updated option summary." }]
    };
  }

  const remainingValues = (optionNode.optionValues ?? [])
    .map((candidate) => optionValueSummaryFromNode(candidate))
    .filter((value): value is ProductOptionValueSummary => Boolean(value))
    .slice(0, 25);
  const remainingIds = new Set(remainingValues.map((value) => value.id));
  if (valueIds.some((valueId) => remainingIds.has(valueId))) {
    return {
      ok: false,
      status: "invalid_response",
      summary: "Shopify product option value delete response still included a deleted option value ID.",
      userErrors: [],
      diagnostics: [{ severity: "error", code: "invalid_response", message: "Shopify product option value delete response still included a deleted option value ID." }]
    };
  }

  return {
    ok: true,
    status: "ok",
    summary: `Deleted ${valueIds.length} Shopify product option value${valueIds.length === 1 ? "" : "s"}.`,
    optionValueDelete: {
      productId: updatedProductId,
      optionId,
      deletedValueCount: valueIds.length,
      valueIds,
      remainingValues,
      variantStrategy: "LEAVE_AS_IS"
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

const productVariantsBulkCreateMutation = /* GraphQL */ `
  mutation ShopifyStoreAgentProductVariantsCreate($productId: ID!, $variants: [ProductVariantsBulkInput!]!) {
    productVariantsBulkCreate(productId: $productId, variants: $variants) {
      productVariants {
        id
        title
        price
        sku
      }
      userErrors {
        field
        message
      }
    }
  }
`;

const productOptionsCreateMutation = /* GraphQL */ `
  mutation ShopifyStoreAgentProductOptionsCreate($productId: ID!, $options: [OptionCreateInput!]!, $variantStrategy: ProductOptionCreateVariantStrategy) {
    productOptionsCreate(productId: $productId, options: $options, variantStrategy: $variantStrategy) {
      product {
        id
        options {
          id
          name
          position
          optionValues {
            id
            name
            hasVariants
          }
        }
      }
      userErrors {
        field
        message
        code
      }
    }
  }
`;

const productOptionsDeleteMutation = /* GraphQL */ `
  mutation ShopifyStoreAgentProductOptionsDelete($productId: ID!, $options: [ID!]!, $strategy: ProductOptionDeleteStrategy) {
    productOptionsDelete(productId: $productId, options: $options, strategy: $strategy) {
      deletedOptionsIds
      product {
        id
        options {
          id
          name
          position
          optionValues {
            id
            name
            hasVariants
          }
        }
      }
      userErrors {
        field
        message
        code
      }
    }
  }
`;

const productOptionsReorderMutation = /* GraphQL */ `
  mutation ShopifyStoreAgentProductOptionsReorder($productId: ID!, $options: [OptionReorderInput!]!) {
    productOptionsReorder(productId: $productId, options: $options) {
      product {
        id
        options {
          id
          name
          position
          optionValues {
            id
            name
            hasVariants
          }
        }
      }
      userErrors {
        field
        message
        code
      }
    }
  }
`;

const productOptionUpdateMutation = /* GraphQL */ `
  mutation ShopifyStoreAgentProductOptionUpdate($productId: ID!, $option: OptionUpdateInput!, $optionValuesToAdd: [OptionValueCreateInput!], $optionValuesToUpdate: [OptionValueUpdateInput!], $optionValuesToDelete: [ID!], $variantStrategy: ProductOptionUpdateVariantStrategy) {
    productOptionUpdate(productId: $productId, option: $option, optionValuesToAdd: $optionValuesToAdd, optionValuesToUpdate: $optionValuesToUpdate, optionValuesToDelete: $optionValuesToDelete, variantStrategy: $variantStrategy) {
      product {
        id
        options {
          id
          name
          position
          optionValues {
            id
            name
            hasVariants
          }
        }
      }
      userErrors {
        field
        message
        code
      }
    }
  }
`;

function mapGraphqlFailure(result: Extract<ShopifyGraphqlResult<ProductCreateData | ProductUpdateData | ProductVariantsBulkUpdateData | ProductVariantsBulkCreateData | ProductOptionsCreateData | ProductOptionsDeleteData | ProductOptionsReorderData | ProductOptionUpdateData>, { ok: false }>): ProductWriteResultBase {
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

function safeVariantCreateInputs(value: ProductVariantCreateInput[] | undefined): ProductVariantCreateInput[] {
  if (!Array.isArray(value)) return [];
  const results: ProductVariantCreateInput[] = [];
  for (const item of value) {
    const optionValues = safeVariantOptionValues(item?.optionValues);
    if (optionValues.length === 0) continue;
    const variant: ProductVariantCreateInput = { optionValues };
    const price = safePrice(item?.price);
    if (price !== undefined) variant.price = price;
    const sku = safeNonSecretText(item?.sku, 120);
    if (sku) variant.sku = sku;
    results.push(variant);
    if (results.length >= 25) break;
  }
  return results;
}

function safeVariantOptionValues(value: ProductVariantOptionValueInput[] | undefined): ProductVariantOptionValueInput[] {
  if (!Array.isArray(value)) return [];
  const results: ProductVariantOptionValueInput[] = [];
  const seen = new Set<string>();
  for (const item of value) {
    const optionName = safeNonSecretText(item?.optionName, 120);
    const name = safeNonSecretText(item?.name, 180);
    if (!optionName || !name) continue;
    const key = `${optionName}\u0000${name}`;
    if (seen.has(key)) continue;
    seen.add(key);
    results.push({ optionName, name });
    if (results.length >= 3) break;
  }
  return results;
}

function safeOptionCreateInputs(value: ProductOptionCreateInput[] | undefined): ProductOptionCreateInput[] {
  if (!Array.isArray(value)) return [];
  const results: ProductOptionCreateInput[] = [];
  const seen = new Set<string>();
  for (const item of value) {
    const name = safeNonSecretText(item?.name, 120);
    const values = safeOptionValueNames(item?.values);
    if (!name || values.length === 0 || seen.has(name)) continue;
    seen.add(name);
    results.push({ name, values });
    if (results.length >= 3) break;
  }
  return results;
}

function safeOptionIds(value: string[] | undefined): string[] {
  if (!Array.isArray(value)) return [];
  const results: string[] = [];
  const seen = new Set<string>();
  for (const item of value) {
    const id = safeText(item, 180);
    if (!id || seen.has(id)) continue;
    seen.add(id);
    results.push(id);
    if (results.length >= 3) break;
  }
  return results;
}

function safeOptionReorderInputs(value: ProductOptionReorderInput[] | undefined): ProductOptionReorderInput[] {
  if (!Array.isArray(value)) return [];
  const results: ProductOptionReorderInput[] = [];
  const seen = new Set<string>();
  for (const item of value) {
    const id = safeText(item?.id, 180);
    const name = safeNonSecretText(item?.name, 120);
    if (!id && !name) continue;
    const key = id ? `id:${id}` : `name:${name}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const option: ProductOptionReorderInput = {};
    if (id) option.id = id;
    else if (name) option.name = name;
    const values = safeOptionReorderValues(item?.values);
    if (values.length > 0) option.values = values;
    results.push(option);
    if (results.length >= 3) break;
  }
  return results;
}

function safeOptionReorderValues(value: ProductOptionReorderValueInput[] | undefined): ProductOptionReorderValueInput[] {
  if (!Array.isArray(value)) return [];
  const results: ProductOptionReorderValueInput[] = [];
  const seen = new Set<string>();
  for (const item of value) {
    const id = safeText(item?.id, 180);
    const name = safeNonSecretText(item?.name, 120);
    if (!id && !name) continue;
    const key = id ? `id:${id}` : `name:${name}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const optionValue: ProductOptionReorderValueInput = {};
    if (id) optionValue.id = id;
    else if (name) optionValue.name = name;
    results.push(optionValue);
    if (results.length >= 25) break;
  }
  return results;
}

function safeOptionUpdateInput(value: ProductOptionUpdateInput | undefined): ProductOptionUpdateInput | undefined {
  const id = safeText(value?.id, 180);
  const name = safeNonSecretText(value?.name, 120);
  return id && name ? { id, name } : undefined;
}

function safeOptionValueUpdateInput(value: ProductOptionValueUpdateInput | undefined): ProductOptionValueUpdateInput | undefined {
  const id = safeText(value?.id, 180);
  const name = safeNonSecretText(value?.name, 120);
  return id && name ? { id, name } : undefined;
}

function safeOptionValueCreateInputs(value: ProductOptionValueCreateInput[] | undefined): ProductOptionValueCreateInput[] {
  if (!Array.isArray(value)) return [];
  const results: ProductOptionValueCreateInput[] = [];
  const seen = new Set<string>();
  for (const item of value) {
    const name = safeNonSecretText(item?.name, 120);
    if (!name || seen.has(name)) continue;
    seen.add(name);
    results.push({ name });
    if (results.length >= 25) break;
  }
  return results;
}

function safeOptionValueIds(value: string[] | undefined): string[] {
  if (!Array.isArray(value)) return [];
  const results: string[] = [];
  const seen = new Set<string>();
  for (const item of value) {
    const id = safeText(item, 180);
    if (!id || seen.has(id)) continue;
    seen.add(id);
    results.push(id);
    if (results.length >= 25) break;
  }
  return results;
}

function optionSummaryFromNode(option: ProductOptionSummaryNode | null | undefined): ProductOptionSummary | undefined {
  const id = safeText(option?.id, 180);
  const name = safeNonSecretText(option?.name, 120);
  if (!id || !name) return undefined;
  return {
    id,
    name,
    position: safePosition(option?.position),
    values: safeOptionValueNames((option?.optionValues ?? []).map((value) => value?.name))
  };
}

function optionValueSummaryFromNode(value: { id?: unknown; name?: unknown } | null | undefined): ProductOptionValueSummary | undefined {
  const id = safeText(value?.id, 180);
  const name = safeNonSecretText(value?.name, 120);
  return id && name ? { id, name } : undefined;
}

function optionMatchesRequested(option: ProductOptionSummary | undefined, requested: ProductOptionReorderInput): boolean {
  if (!option) return false;
  if (requested.id) return option.id === requested.id;
  return Boolean(requested.name && option.name === requested.name);
}

function safeOptionValueNames(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const results: string[] = [];
  const seen = new Set<string>();
  for (const item of value) {
    const name = safeNonSecretText(item, 120);
    if (!name || seen.has(name)) continue;
    seen.add(name);
    results.push(name);
    if (results.length >= 25) break;
  }
  return results;
}

function safePosition(value: unknown): number | undefined {
  return typeof value === "number" && Number.isInteger(value) && value > 0 ? value : undefined;
}

function safePrice(value: unknown): string | undefined {
  if (typeof value === "number" && Number.isFinite(value) && value >= 0) return value.toFixed(2);
  if (typeof value !== "string" || !value.trim()) return undefined;
  if (looksLikeSecret(value)) return undefined;
  const normalized = value.trim();
  if (!/^\d+(\.\d{1,2})?$/.test(normalized)) return undefined;
  return normalized;
}

function safeNonSecretText(value: unknown, maxLength: number): string | undefined {
  if (typeof value !== "string" || !value.trim()) return undefined;
  if (looksLikeSecret(value)) return undefined;
  const normalized = value.trim();
  return normalized.length > maxLength ? `${normalized.slice(0, maxLength)}...` : normalized;
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
