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

export interface InventoryAdjustQuantityInput {
  inventoryItemId: string;
  locationId: string;
  delta: number;
  reason: string;
  referenceDocumentUri?: string;
  idempotencyKey: string;
}

export interface InventoryMoveQuantityInput {
  inventoryItemId: string;
  locationId: string;
  quantity: number;
  fromName: string;
  toName: string;
  reason: string;
  referenceDocumentUri?: string;
  idempotencyKey: string;
}

export interface InventoryTransferInput {
  inventoryItemId: string;
  fromLocationId: string;
  toLocationId: string;
  quantity: number;
  reason: string;
  referenceDocumentUri?: string;
  idempotencyKey: string;
}

export interface InventoryTransferMarkReadyInput {
  inventoryTransferId: string;
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

export interface InventoryAdjustQuantitySummary {
  inventoryItemId: string;
  locationId: string;
  name: "available";
  delta: number;
  reason?: string;
  referenceDocumentUri?: string;
  changes: InventoryQuantityChangeSummary[];
}

export interface InventoryMoveQuantitySummary {
  inventoryItemId: string;
  locationId: string;
  quantity: number;
  fromName: string;
  toName: string;
  reason?: string;
  referenceDocumentUri?: string;
  changes: InventoryQuantityChangeSummary[];
}

export interface InventoryTransferSummary {
  inventoryTransferId: string;
  status?: string;
  inventoryItemId: string;
  fromLocationId: string;
  toLocationId: string;
  quantity: number;
  reason?: string;
  referenceDocumentUri?: string;
}

export interface InventoryTransferMarkReadySummary {
  inventoryTransferId: string;
  status?: string;
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

export interface InventoryAdjustQuantityResult extends InventoryWriteResultBase {
  inventoryAdjustment?: InventoryAdjustQuantitySummary;
}

export interface InventoryMoveQuantityResult extends InventoryWriteResultBase {
  inventoryMove?: InventoryMoveQuantitySummary;
}

export interface InventoryTransferResult extends InventoryWriteResultBase {
  inventoryTransfer?: InventoryTransferSummary;
}

export interface InventoryTransferMarkReadyResult extends InventoryWriteResultBase {
  inventoryTransfer?: InventoryTransferMarkReadySummary;
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

interface InventoryAdjustQuantitiesData {
  inventoryAdjustQuantities?: {
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

interface InventoryMoveQuantitiesData {
  inventoryMoveQuantities?: {
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

interface InventoryTransferCreateData {
  inventoryTransferCreate?: {
    inventoryTransfer?: {
      id?: unknown;
      status?: unknown;
    } | null;
    userErrors?: GraphqlUserError[];
  } | null;
}

interface InventoryTransferMarkReadyData {
  inventoryTransferMarkAsReadyToShip?: {
    inventoryTransfer?: {
      id?: unknown;
      status?: unknown;
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

export async function adjustInventoryQuantity(
  config: StoreAgentConfig,
  input: InventoryAdjustQuantityInput,
  options: InventoryWriteOptions = {}
): Promise<InventoryAdjustQuantityResult> {
  if (config.readOnly) return blocked("Inventory quantity adjustment is blocked because read-only mode is enabled.");

  const inventoryItemId = safeText(input.inventoryItemId, 180);
  if (!inventoryItemId) return missingInput("Provide an inventory item ID.");

  const locationId = safeText(input.locationId, 180);
  if (!locationId) return missingInput("Provide a location ID.");

  const delta = safeInventoryDelta(input.delta);
  if (delta === undefined) return missingInput("Provide a non-zero integer inventory adjustment delta.");

  const reason = safeNonSecretText(input.reason, 120);
  if (!reason) return missingInput("Provide an inventory adjustment reason.");

  const idempotencyKey = safeIdempotencyKey(input.idempotencyKey);
  if (!idempotencyKey) return missingInput("Provide an idempotency key.");

  const referenceDocumentUri = safeOptionalUri(input.referenceDocumentUri);
  const variables = {
    input: {
      name: "available",
      reason,
      referenceDocumentUri,
      changes: [{
        inventoryItemId,
        locationId,
        delta
      }]
    },
    idempotencyKey
  };

  const client = new ShopifyGraphqlClient(config, options.fetcher);
  let result: ShopifyGraphqlResult<InventoryAdjustQuantitiesData>;
  try {
    result = await client.request<InventoryAdjustQuantitiesData>({
      query: inventoryAdjustQuantitiesMutation,
      variables
    });
  } catch {
    return shopifyFailure("Shopify inventory quantity adjustment request failed before a safe response was available.");
  }

  if (!result.ok) return mapGraphqlFailure(result);

  const userErrors = result.data.inventoryAdjustQuantities?.userErrors ?? result.userErrors;
  if (userErrors.length > 0) {
    return {
      ok: false,
      status: "user_errors",
      summary: "Shopify rejected the inventory quantity adjustment request.",
      userErrors: sanitizeUserErrors(userErrors),
      diagnostics: [{ severity: "warning", code: "shopify_user_errors", message: "Shopify returned inventory adjustment user errors." }]
    };
  }

  const group = result.data.inventoryAdjustQuantities?.inventoryAdjustmentGroup;
  if (!group) {
    return {
      ok: false,
      status: "invalid_response",
      summary: "Shopify inventory quantity adjustment response did not include an adjustment group.",
      userErrors: [],
      diagnostics: [{ severity: "error", code: "invalid_response", message: "Shopify inventory quantity adjustment response did not include an adjustment group." }]
    };
  }

  return {
    ok: true,
    status: "ok",
    summary: `Adjusted Shopify inventory quantity by ${delta}.`,
    inventoryAdjustment: {
      inventoryItemId,
      locationId,
      name: "available",
      delta,
      reason: safeText(group.reason, 120) ?? reason,
      referenceDocumentUri: safeText(group.referenceDocumentUri, 255) ?? referenceDocumentUri,
      changes: safeInventoryChanges(group.changes)
    },
    userErrors: [],
    diagnostics: []
  };
}

export async function moveInventoryQuantity(
  config: StoreAgentConfig,
  input: InventoryMoveQuantityInput,
  options: InventoryWriteOptions = {}
): Promise<InventoryMoveQuantityResult> {
  if (config.readOnly) return blocked("Inventory quantity move is blocked because read-only mode is enabled.");

  const inventoryItemId = safeText(input.inventoryItemId, 180);
  if (!inventoryItemId) return missingInput("Provide an inventory item ID.");

  const locationId = safeText(input.locationId, 180);
  if (!locationId) return missingInput("Provide a location ID.");

  const quantity = safeMoveQuantity(input.quantity);
  if (quantity === undefined) return missingInput("Provide a positive integer inventory move quantity.");

  const fromName = safeQuantityName(input.fromName);
  if (!fromName) return missingInput("Provide a supported source inventory quantity name.");

  const toName = safeQuantityName(input.toName);
  if (!toName) return missingInput("Provide a supported destination inventory quantity name.");
  if (fromName === toName) return missingInput("Source and destination inventory quantity names must differ.");

  const reason = safeNonSecretText(input.reason, 120);
  if (!reason) return missingInput("Provide an inventory move reason.");

  const idempotencyKey = safeIdempotencyKey(input.idempotencyKey);
  if (!idempotencyKey) return missingInput("Provide an idempotency key.");

  const referenceDocumentUri = safeOptionalUri(input.referenceDocumentUri);
  const variables = {
    input: {
      reason,
      referenceDocumentUri,
      changes: [{
        quantity,
        inventoryItemId,
        from: {
          locationId,
          name: fromName,
          ledgerDocumentUri: null,
          changeFromQuantity: null
        },
        to: {
          locationId,
          name: toName,
          ledgerDocumentUri: null,
          changeFromQuantity: null
        }
      }]
    },
    idempotencyKey
  };

  const client = new ShopifyGraphqlClient(config, options.fetcher);
  let result: ShopifyGraphqlResult<InventoryMoveQuantitiesData>;
  try {
    result = await client.request<InventoryMoveQuantitiesData>({
      query: inventoryMoveQuantitiesMutation,
      variables
    });
  } catch {
    return shopifyFailure("Shopify inventory quantity move request failed before a safe response was available.");
  }

  if (!result.ok) return mapGraphqlFailure(result);

  const userErrors = result.data.inventoryMoveQuantities?.userErrors ?? result.userErrors;
  if (userErrors.length > 0) {
    return {
      ok: false,
      status: "user_errors",
      summary: "Shopify rejected the inventory quantity move request.",
      userErrors: sanitizeUserErrors(userErrors),
      diagnostics: [{ severity: "warning", code: "shopify_user_errors", message: "Shopify returned inventory move user errors." }]
    };
  }

  const group = result.data.inventoryMoveQuantities?.inventoryAdjustmentGroup;
  if (!group) {
    return {
      ok: false,
      status: "invalid_response",
      summary: "Shopify inventory quantity move response did not include an adjustment group.",
      userErrors: [],
      diagnostics: [{ severity: "error", code: "invalid_response", message: "Shopify inventory quantity move response did not include an adjustment group." }]
    };
  }

  return {
    ok: true,
    status: "ok",
    summary: `Moved ${quantity} Shopify inventory units from ${fromName} to ${toName}.`,
    inventoryMove: {
      inventoryItemId,
      locationId,
      quantity,
      fromName,
      toName,
      reason: safeText(group.reason, 120) ?? reason,
      referenceDocumentUri: safeText(group.referenceDocumentUri, 255) ?? referenceDocumentUri,
      changes: safeInventoryChanges(group.changes)
    },
    userErrors: [],
    diagnostics: []
  };
}

export async function createInventoryTransfer(
  config: StoreAgentConfig,
  input: InventoryTransferInput,
  options: InventoryWriteOptions = {}
): Promise<InventoryTransferResult> {
  if (config.readOnly) return blocked("Inventory transfer is blocked because read-only mode is enabled.");

  const inventoryItemId = safeText(input.inventoryItemId, 180);
  if (!inventoryItemId) return missingInput("Provide an inventory item ID.");

  const fromLocationId = safeText(input.fromLocationId, 180);
  if (!fromLocationId) return missingInput("Provide a source location ID.");

  const toLocationId = safeText(input.toLocationId, 180);
  if (!toLocationId) return missingInput("Provide a destination location ID.");
  if (fromLocationId === toLocationId) return missingInput("Source and destination location IDs must differ.");

  const quantity = safeMoveQuantity(input.quantity);
  if (quantity === undefined) return missingInput("Provide a positive integer inventory transfer quantity.");

  const reason = safeNonSecretText(input.reason, 120);
  if (!reason) return missingInput("Provide an inventory transfer reason.");

  const idempotencyKey = safeIdempotencyKey(input.idempotencyKey);
  if (!idempotencyKey) return missingInput("Provide an idempotency key.");

  const referenceDocumentUri = safeOptionalUri(input.referenceDocumentUri);
  const variables = {
    input: {
      originLocationId: fromLocationId,
      destinationLocationId: toLocationId,
      lineItems: [{
        inventoryItemId,
        quantity
      }],
      note: reason,
      referenceName: referenceDocumentUri
    },
    idempotencyKey
  };

  const client = new ShopifyGraphqlClient(config, options.fetcher);
  let result: ShopifyGraphqlResult<InventoryTransferCreateData>;
  try {
    result = await client.request<InventoryTransferCreateData>({
      query: inventoryTransferCreateMutation,
      variables
    });
  } catch {
    return shopifyFailure("Shopify inventory transfer request failed before a safe response was available.");
  }

  if (!result.ok) return mapGraphqlFailure(result);

  const userErrors = result.data.inventoryTransferCreate?.userErrors ?? result.userErrors;
  if (userErrors.length > 0) {
    return {
      ok: false,
      status: "user_errors",
      summary: "Shopify rejected the inventory transfer request.",
      userErrors: sanitizeUserErrors(userErrors),
      diagnostics: [{ severity: "warning", code: "shopify_user_errors", message: "Shopify returned inventory transfer user errors." }]
    };
  }

  const transfer = result.data.inventoryTransferCreate?.inventoryTransfer;
  const inventoryTransferId = safeText(transfer?.id, 180);
  if (!inventoryTransferId) {
    return {
      ok: false,
      status: "invalid_response",
      summary: "Shopify inventory transfer response did not include a transfer ID.",
      userErrors: [],
      diagnostics: [{ severity: "error", code: "invalid_response", message: "Shopify inventory transfer response did not include a transfer ID." }]
    };
  }

  return {
    ok: true,
    status: "ok",
    summary: `Created Shopify inventory transfer draft for ${quantity} unit${quantity === 1 ? "" : "s"}.`,
    inventoryTransfer: {
      inventoryTransferId,
      status: safeText(transfer?.status, 80),
      inventoryItemId,
      fromLocationId,
      toLocationId,
      quantity,
      reason,
      referenceDocumentUri
    },
    userErrors: [],
    diagnostics: []
  };
}

export async function markInventoryTransferReady(
  config: StoreAgentConfig,
  input: InventoryTransferMarkReadyInput,
  options: InventoryWriteOptions = {}
): Promise<InventoryTransferMarkReadyResult> {
  if (config.readOnly) return blocked("Inventory transfer mark-ready is blocked because read-only mode is enabled.");

  const inventoryTransferId = safeText(input.inventoryTransferId, 180);
  if (!inventoryTransferId) return missingInput("Provide an inventory transfer ID.");

  const client = new ShopifyGraphqlClient(config, options.fetcher);
  let result: ShopifyGraphqlResult<InventoryTransferMarkReadyData>;
  try {
    result = await client.request<InventoryTransferMarkReadyData>({
      query: inventoryTransferMarkReadyMutation,
      variables: { id: inventoryTransferId }
    });
  } catch {
    return shopifyFailure("Shopify inventory transfer mark-ready request failed before a safe response was available.");
  }

  if (!result.ok) return mapGraphqlFailure(result);

  const userErrors = result.data.inventoryTransferMarkAsReadyToShip?.userErrors ?? result.userErrors;
  if (userErrors.length > 0) {
    return {
      ok: false,
      status: "user_errors",
      summary: "Shopify rejected the inventory transfer mark-ready request.",
      userErrors: sanitizeUserErrors(userErrors),
      diagnostics: [{ severity: "warning", code: "shopify_user_errors", message: "Shopify returned inventory transfer mark-ready user errors." }]
    };
  }

  const transfer = result.data.inventoryTransferMarkAsReadyToShip?.inventoryTransfer;
  const markedTransferId = safeText(transfer?.id, 180);
  if (!markedTransferId) {
    return {
      ok: false,
      status: "invalid_response",
      summary: "Shopify inventory transfer mark-ready response did not include a transfer ID.",
      userErrors: [],
      diagnostics: [{ severity: "error", code: "invalid_response", message: "Shopify inventory transfer mark-ready response did not include a transfer ID." }]
    };
  }

  return {
    ok: true,
    status: "ok",
    summary: "Marked Shopify inventory transfer ready to ship.",
    inventoryTransfer: {
      inventoryTransferId: markedTransferId,
      status: safeText(transfer?.status, 80)
    },
    userErrors: [],
    diagnostics: []
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

const inventoryAdjustQuantitiesMutation = /* GraphQL */ `
  mutation ShopifyStoreAgentInventoryAdjustQuantities($input: InventoryAdjustQuantitiesInput!, $idempotencyKey: String!) {
    inventoryAdjustQuantities(input: $input) @idempotent(key: $idempotencyKey) {
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

const inventoryMoveQuantitiesMutation = /* GraphQL */ `
  mutation ShopifyStoreAgentInventoryMoveQuantities($input: InventoryMoveQuantitiesInput!, $idempotencyKey: String!) {
    inventoryMoveQuantities(input: $input) @idempotent(key: $idempotencyKey) {
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

const inventoryTransferCreateMutation = /* GraphQL */ `
  mutation ShopifyStoreAgentInventoryTransferCreate($input: InventoryTransferCreateInput!, $idempotencyKey: String!) {
    inventoryTransferCreate(input: $input) @idempotent(key: $idempotencyKey) {
      inventoryTransfer {
        id
        status
      }
      userErrors {
        field
        message
        code
      }
    }
  }
`;

const inventoryTransferMarkReadyMutation = /* GraphQL */ `
  mutation ShopifyStoreAgentInventoryTransferMarkReady($id: ID!) {
    inventoryTransferMarkAsReadyToShip(id: $id) {
      inventoryTransfer {
        id
        status
      }
      userErrors {
        field
        message
        code
      }
    }
  }
`;

function mapGraphqlFailure(result: Extract<ShopifyGraphqlResult<InventorySetQuantitiesData | InventoryAdjustQuantitiesData | InventoryMoveQuantitiesData | InventoryTransferCreateData | InventoryTransferMarkReadyData>, { ok: false }>): InventoryWriteResultBase {
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

function safeInventoryDelta(value: unknown): number | undefined {
  const integer = safeInteger(value);
  return integer !== undefined && integer !== 0 && integer >= -1_000_000_000 && integer <= 1_000_000_000 ? integer : undefined;
}

function safeMoveQuantity(value: unknown): number | undefined {
  const integer = safeInteger(value);
  return integer !== undefined && integer > 0 && integer <= 1_000_000_000 ? integer : undefined;
}

function safeQuantityName(value: unknown): string | undefined {
  const text = safeNonSecretText(value, 80);
  if (!text) return undefined;
  const normalized = text.toLowerCase();
  return ["available", "reserved", "damaged", "quality_control", "safety_stock"].includes(normalized) ? normalized : undefined;
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
