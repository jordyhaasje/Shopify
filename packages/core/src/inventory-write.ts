import type { StoreAgentConfig } from "./config.js";
import { ShopifyGraphqlClient, type FetchLike, type GraphqlUserError, type ShopifyGraphqlResult } from "./shopify-client.js";

export interface InventorySetQuantityInput {
  inventoryItemId: string;
  locationId: string;
  quantity: number;
  compareQuantity?: number | null;
  ignoreCompareQuantity?: boolean;
  reason: string;
  referenceDocumentUri?: string;
  idempotencyKey: string;
}

export interface InventoryQuantityChangeSummary {
  name?: string;
  delta?: number;
  quantityAfterChange?: number | null;
}

export interface InventorySetQuantitySummary {
  inventoryItemId: string;
  locationId: string;
  name: "available";
  quantity: number;
  compareQuantity?: number | null;
  ignoreCompareQuantity: boolean;
  reason?: string;
  referenceDocumentUri?: string;
  changes: InventoryQuantityChangeSummary[];
}

export interface InventoryWriteDiagnostic {
  severity: "warning" | "error";
  code: string;
  message: string;
}

type InventoryWriteStatus = "ok" | "blocked" | "missing_input" | "user_errors" | "shopify_error" | "invalid_response";

interface InventoryWriteResultBase {
  ok: boolean;
  status: InventoryWriteStatus;
  summary: string;
  userErrors: GraphqlUserError[];
  diagnostics: InventoryWriteDiagnostic[];
}

export interface InventorySetQuantityResult extends InventoryWriteResultBase {
  inventorySet?: InventorySetQuantitySummary;
}

export interface InventoryWriteOptions {
  fetcher?: FetchLike;
}

interface InventorySetQuantitiesData {
  inventorySetQuantities?: {
    inventoryAdjustmentGroup?: {
      reason?: unknown;
      referenceDocumentUri?: unknown;
      changes?: Array<{
        name?: unknown;
        delta?: unknown;
        quantityAfterChange?: unknown;
      } | null> | null;
    } | null;
    userErrors?: GraphqlUserError[];
  } | null;
}

type InventoryAdjustmentChangeNode = {
  name?: unknown;
  delta?: unknown;
  quantityAfterChange?: unknown;
} | null;

export async function setInventoryQuantity(
  config: StoreAgentConfig,
  input: InventorySetQuantityInput,
  options: InventoryWriteOptions = {}
): Promise<InventorySetQuantityResult> {
  if (config.readOnly) return blocked("Inventory quantity set is blocked because read-only mode is enabled.");

  const inventoryItemId = safeText(input.inventoryItemId, 180);
  if (!inventoryItemId) return missingInput("Provide an inventory item ID.");

  const locationId = safeText(input.locationId, 180);
  if (!locationId) return missingInput("Provide a location ID.");

  const quantity = safeInventoryQuantity(input.quantity);
  if (quantity === undefined) return missingInput("Provide a non-negative integer inventory quantity.");

  const reason = safeNonSecretText(input.reason, 120);
  if (!reason) return missingInput("Provide an inventory adjustment reason.");

  const idempotencyKey = safeIdempotencyKey(input.idempotencyKey);
  if (!idempotencyKey) return missingInput("Provide an idempotency key.");

  const ignoreCompareQuantity = input.ignoreCompareQuantity === true;
  const compareQuantity = safeOptionalInventoryQuantity(input.compareQuantity);
  if (!ignoreCompareQuantity && compareQuantity === undefined) {
    return missingInput("Provide compareQuantity, or explicitly set ignoreCompareQuantity to true.");
  }

  const referenceDocumentUri = safeOptionalUri(input.referenceDocumentUri);
  const variables = {
    input: {
      name: "available",
      reason,
      referenceDocumentUri,
      ignoreCompareQuantity: ignoreCompareQuantity || undefined,
      quantities: [{
        inventoryItemId,
        locationId,
        quantity,
        compareQuantity: ignoreCompareQuantity ? null : compareQuantity
      }]
    },
    idempotencyKey
  };

  const client = new ShopifyGraphqlClient(config, options.fetcher);
  let result: ShopifyGraphqlResult<InventorySetQuantitiesData>;
  try {
    result = await client.request<InventorySetQuantitiesData>({
      query: inventorySetQuantitiesMutation,
      variables
    });
  } catch {
    return shopifyFailure("Shopify inventory quantity set request failed before a safe response was available.");
  }

  if (!result.ok) return mapGraphqlFailure(result);

  const userErrors = result.data.inventorySetQuantities?.userErrors ?? result.userErrors;
  if (userErrors.length > 0) {
    return {
      ok: false,
      status: "user_errors",
      summary: "Shopify rejected the inventory quantity set request.",
      userErrors: sanitizeUserErrors(userErrors),
      diagnostics: [{ severity: "warning", code: "shopify_user_errors", message: "Shopify returned inventory quantity user errors." }]
    };
  }

  const group = result.data.inventorySetQuantities?.inventoryAdjustmentGroup;
  if (!group) {
    return {
      ok: false,
      status: "invalid_response",
      summary: "Shopify inventory quantity set response did not include an adjustment group.",
      userErrors: [],
      diagnostics: [{ severity: "error", code: "invalid_response", message: "Shopify inventory quantity set response did not include an adjustment group." }]
    };
  }

  return {
    ok: true,
    status: "ok",
    summary: `Set Shopify inventory quantity to ${quantity}.`,
    inventorySet: {
      inventoryItemId,
      locationId,
      name: "available",
      quantity,
      compareQuantity: ignoreCompareQuantity ? null : compareQuantity,
      ignoreCompareQuantity,
      reason: safeText(group.reason, 120) ?? reason,
      referenceDocumentUri: safeText(group.referenceDocumentUri, 255) ?? referenceDocumentUri,
      changes: safeInventoryChanges(group.changes)
    },
    userErrors: [],
    diagnostics: ignoreCompareQuantity
      ? [{ severity: "warning", code: "compare_quantity_ignored", message: "Inventory quantity was set with compare quantity checks explicitly disabled." }]
      : []
  };
}

const inventorySetQuantitiesMutation = /* GraphQL */ `
  mutation ShopifyStoreAgentInventorySetQuantities($input: InventorySetQuantitiesInput!, $idempotencyKey: String!) {
    inventorySetQuantities(input: $input) @idempotent(key: $idempotencyKey) {
      inventoryAdjustmentGroup {
        reason
        referenceDocumentUri
        changes {
          name
          delta
          quantityAfterChange
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

function mapGraphqlFailure(result: Extract<ShopifyGraphqlResult<InventorySetQuantitiesData>, { ok: false }>): InventoryWriteResultBase {
  return {
    ok: false,
    status: "shopify_error",
    summary: result.error.message,
    userErrors: sanitizeUserErrors(result.userErrors),
    diagnostics: [{ severity: "error", code: result.error.type, message: result.error.message }]
  };
}

function blocked(summary: string): InventoryWriteResultBase {
  return {
    ok: false,
    status: "blocked",
    summary,
    userErrors: [],
    diagnostics: [{ severity: "warning", code: "read_only", message: summary }]
  };
}

function missingInput(summary: string): InventoryWriteResultBase {
  return {
    ok: false,
    status: "missing_input",
    summary,
    userErrors: [],
    diagnostics: [{ severity: "warning", code: "missing_input", message: summary }]
  };
}

function shopifyFailure(summary: string): InventoryWriteResultBase {
  return {
    ok: false,
    status: "shopify_error",
    summary,
    userErrors: [],
    diagnostics: [{ severity: "error", code: "shopify_request_failed", message: summary }]
  };
}

function sanitizeUserErrors(errors: GraphqlUserError[]): GraphqlUserError[] {
  return errors.slice(0, 5).map((error) => ({
    field: error.field?.slice(0, 5),
    message: safeText(error.message, 240) ?? "Shopify returned an inventory error."
  }));
}

function safeInventoryChanges(value: InventoryAdjustmentChangeNode[] | null | undefined): InventoryQuantityChangeSummary[] {
  if (!Array.isArray(value)) return [];
  const changes: InventoryQuantityChangeSummary[] = [];
  for (const item of value.slice(0, 10)) {
    if (!item) continue;
    const change: InventoryQuantityChangeSummary = {};
    const name = safeText(item.name, 80);
    if (name) change.name = name;
    const delta = safeInteger(item.delta);
    if (delta !== undefined) change.delta = delta;
    const quantityAfterChange = item.quantityAfterChange === null ? null : safeInteger(item.quantityAfterChange);
    if (quantityAfterChange !== undefined) change.quantityAfterChange = quantityAfterChange;
    changes.push(change);
  }
  return changes;
}

function safeOptionalInventoryQuantity(value: unknown): number | null | undefined {
  if (value === null) return null;
  return safeInventoryQuantity(value);
}

function safeInventoryQuantity(value: unknown): number | undefined {
  const integer = safeInteger(value);
  return integer !== undefined && integer >= 0 && integer <= 1_000_000_000 ? integer : undefined;
}

function safeInteger(value: unknown): number | undefined {
  return typeof value === "number" && Number.isInteger(value) ? value : undefined;
}

function safeOptionalUri(value: unknown): string | undefined {
  const text = safeNonSecretText(value, 255);
  if (!text) return undefined;
  try {
    const url = new URL(text);
    if (!url.protocol || !url.pathname) return undefined;
    return text;
  } catch {
    return undefined;
  }
}

function safeIdempotencyKey(value: unknown): string | undefined {
  const text = safeNonSecretText(value, 120);
  return text && /^[a-zA-Z0-9:_-]+$/.test(text) ? text : undefined;
}

function safeNonSecretText(value: unknown, maxLength: number): string | undefined {
  const text = safeText(value, maxLength);
  return text && text !== "[redacted]" ? text : undefined;
}

function safeText(value: unknown, maxLength: number): string | undefined {
  if (typeof value !== "string" && typeof value !== "number") return undefined;
  const text = String(value).trim();
  if (!text) return undefined;
  if (looksLikeSecret(text)) return "[redacted]";
  return text.length > maxLength ? `${text.slice(0, maxLength)}...` : text;
}

function looksLikeSecret(value: string): boolean {
  return /shpat_|shpca_|shpss_|access[_-]?token|bearer\s+[a-z0-9._-]+|client[_-]?secret|api[_-]?key/i.test(value);
}
