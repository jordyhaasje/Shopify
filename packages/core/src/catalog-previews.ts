export type CatalogPreviewStatus = "ok" | "missing_input" | "validation_error";

export interface PreviewWarning {
  code: string;
  message: string;
}

export interface PreviewChange {
  field: string;
  action: "create" | "update" | "add" | "delete" | "reorder" | "plan";
  before?: unknown;
  after?: unknown;
  value?: unknown;
  summary?: string;
}

export interface PreviewTarget {
  type: "product" | "product_media" | "product_url_import" | "inventory" | "inventory_transfer" | "inventory_shipment" | "page" | "collection";
  id?: string;
  handle?: string;
  title?: string;
  url?: string;
}

export interface PreviewAuditContext {
  tool: string;
  mode: "preview";
  target: string;
  requiresExecuteConfirmation: true;
  performsShopifyMutation: false;
  usesShopifyWriteOperation: false;
}

export interface CatalogPreviewResult {
  ok: boolean;
  status: CatalogPreviewStatus;
  previewId: string;
  summary: string;
  target: PreviewTarget;
  proposedChanges: PreviewChange[];
  warnings: PreviewWarning[];
  requiredConfirmationForExecute: string;
  auditContext: PreviewAuditContext;
}

type PreviewTool =
  | "product.create.preview"
  | "product.update.preview"
  | "product.media.update.preview"
  | "product.importFromUserUrl.preview"
  | "inventory.setQuantity.preview"
  | "inventory.adjustQuantity.preview"
  | "inventory.moveQuantity.preview"
  | "inventory.transfer.preview"
  | "inventory.transfer.markReady.preview"
  | "inventory.transfer.cancel.preview"
  | "inventory.transfer.ship.preview"
  | "inventory.transfer.receive.preview"
  | "page.create.preview"
  | "collection.create.preview";

const requiredConfirmationForExecute = "Execute requires this preview ID, stored preview binding, reviewed payload, matching hashes, and explicit user confirmation before any Shopify mutation. Execute tools that are still placeholders remain not implemented.";
const omitted = "[omitted]";
const redacted = "[redacted]";
const maxScalarLength = 180;
const maxSummaryLength = 240;

export function previewProductCreate(input: Record<string, unknown>): CatalogPreviewResult {
  const title = firstString(input.title);
  const target = productTarget({ title: title || undefined });
  if (!title) return missingInput("product.create.preview", target, "Provide a product title.");

  const warnings: PreviewWarning[] = [];
  const variants = arrayInput(input.variants);
  const media = arrayInput(input.media) ?? arrayInput(input.images);
  const tags = tagSummary(input.tags);
  const status = stringValue(input.status);
  const price = input.price;

  if (!firstString(input.description, input.body, input.bodyHtml)) warnings.push(warning("missing_description", "No product description/body was provided."));
  if (!firstString(input.vendor)) warnings.push(warning("missing_vendor", "No vendor was provided."));
  if (!firstString(input.productType)) warnings.push(warning("missing_product_type", "No product type was provided."));
  if (status && !isProductStatus(status)) return validationError("product.create.preview", target, `Unsupported product status: ${status}.`);
  if (price !== undefined && !isValidPrice(price)) return validationError("product.create.preview", target, "Product price must be a non-negative number or numeric string.");
  if (input.variants !== undefined && !variants) return validationError("product.create.preview", target, "Variants must be provided as an array.");
  if ((input.media !== undefined || input.images !== undefined) && !media) return validationError("product.create.preview", target, "Media/images must be provided as an array.");

  const changes = compactChanges([
    createChange("title", title),
    createChange("description", contentSummary(firstString(input.description, input.body, input.bodyHtml))),
    createChange("vendor", firstString(input.vendor)),
    createChange("productType", firstString(input.productType)),
    createChange("status", status),
    createChange("tags", tags),
    createChange("price", summarizeValue("price", price)),
    variants ? {
      field: "variants",
      action: "create" as const,
      summary: `${variants.length} variant${variants.length === 1 ? "" : "s"} supplied`,
      value: summarizeVariants(variants)
    } : undefined,
    media ? {
      field: "media",
      action: "add" as const,
      summary: `${media.length} media reference${media.length === 1 ? "" : "s"} supplied`,
      value: summarizeMedia(media)
    } : undefined,
    createChange("seo", summarizeObject(input.seo)),
    createChange("metafields", countSummary(input.metafields, "metafield"))
  ]);

  return okResult("product.create.preview", target, `Preview product creation for "${title}".`, changes, warnings);
}

export function previewProductUpdate(input: Record<string, unknown>): CatalogPreviewResult {
  const target = productTarget(input);
  if (!target.id && !target.handle) return missingInput("product.update.preview", target, "Provide an explicit product ID or handle.");

  const updateFields = updatePayload(input, ["id", "productId", "handle", "existingProduct", "existingProductSummary", "enrichExistingProduct"]);
  if (Object.keys(updateFields).length === 0) return validationError("product.update.preview", target, "Provide at least one product change to preview.");

  const existing = objectInput(input.existingProduct) ?? objectInput(input.existingProductSummary);
  const warnings: PreviewWarning[] = existing ? [] : [warning("before_unknown", "Existing product summary was not supplied, so before values are unknown.")];
  const changes = Object.entries(updateFields).map(([field, value]) => ({
    field,
    action: isOptionOrderField(field) ? "reorder" as const : "update" as const,
    before: existing && field in existing ? summarizeValue(field, existing[field]) : "unknown",
    after: summarizeUpdateValue(field, value)
  }));

  return okResult("product.update.preview", target, `Preview ${changes.length} product update${changes.length === 1 ? "" : "s"} for ${targetLabel(target)}.`, changes, warnings);
}

export function previewProductMediaUpdate(input: Record<string, unknown>): CatalogPreviewResult {
  const product = productTarget(input);
  const target: PreviewTarget = { type: "product_media", id: product.id, handle: product.handle, title: product.title };
  if (!target.id && !target.handle) return missingInput("product.media.update.preview", target, "Provide an explicit product ID or handle.");

  const additions = arrayInput(input.media) ?? arrayInput(input.images) ?? arrayInput(input.add);
  const updates = arrayInput(input.updates);
  const deletes = arrayInput(input.deletes) ?? arrayInput(input.deleteMediaIds) ?? arrayInput(input.delete);
  const order = arrayInput(input.order);
  if (input.media !== undefined && !arrayInput(input.media)) return validationError("product.media.update.preview", target, "Media must be provided as an array.");
  if (input.images !== undefined && !arrayInput(input.images)) return validationError("product.media.update.preview", target, "Images must be provided as an array.");
  if (input.updates !== undefined && !updates) return validationError("product.media.update.preview", target, "Media updates must be provided as an array.");

  const changes = compactChanges([
    additions ? mediaChange("media", "add", additions) : undefined,
    updates ? mediaChange("media", "update", updates) : undefined,
    deletes ? mediaChange("media", "delete", deletes) : undefined,
    order ? mediaChange("media", "reorder", order) : undefined
  ]);
  if (changes.length === 0) return validationError("product.media.update.preview", target, "Provide media references, updates, deletes, or ordering instructions.");

  const warnings = deletes?.length ? [warning("delete_requires_review", "Media delete instructions must be reviewed carefully before any future execute step.")] : [];
  return okResult("product.media.update.preview", target, `Preview media changes for ${targetLabel(product)}.`, changes, warnings);
}

export function previewProductImportFromUserUrl(input: Record<string, unknown>): CatalogPreviewResult {
  const url = firstString(input.url);
  const target: PreviewTarget = { type: "product_url_import", url: url || undefined };
  if (!url) return missingInput("product.importFromUserUrl.preview", target, "Provide a user-supplied product URL.");
  if (!isHttpUrl(url)) return validationError("product.importFromUserUrl.preview", target, "Product import URL must be an http or https URL.");

  const instructions = firstString(input.instructions, input.importInstructions, input.allowedUse, input.rewriteInstructions);
  if (!instructions) return missingInput("product.importFromUserUrl.preview", target, "Provide explicit instructions for what may be imported or recreated.");

  const changes: PreviewChange[] = [
    {
      field: "sourceUrl",
      action: "plan",
      value: sanitizeUrl(url),
      summary: "Use only the user-provided public URL as a planning reference."
    },
    {
      field: "rewriteInstructions",
      action: "plan",
      value: contentSummary(instructions),
      summary: "Create original product copy/media guidance from public rendered-page or user-provided signals only."
    },
    {
      field: "privateAssets",
      action: "plan",
      value: "not accessed",
      summary: "Do not fetch or copy private Liquid, protected source code, or private assets."
    }
  ];
  const warnings = [warning("no_fetch_performed", "This preview does not fetch, scrape, or verify the URL; it only creates a safe import/rewrite plan.")];
  return okResult("product.importFromUserUrl.preview", target, "Preview product import/rewrite plan from user-provided URL.", changes, warnings);
}

export function previewInventorySetQuantity(input: Record<string, unknown>): CatalogPreviewResult {
  const inventoryItemId = firstString(input.inventoryItemId, input.inventoryItemID);
  const locationId = firstString(input.locationId, input.locationID);
  const target: PreviewTarget = { type: "inventory", id: inventoryItemId || undefined };
  if (!inventoryItemId) return missingInput("inventory.setQuantity.preview", target, "Provide an inventory item ID.");
  if (!locationId) return missingInput("inventory.setQuantity.preview", target, "Provide a location ID.");

  const quantity = integerValue(input.quantity);
  if (quantity === undefined || quantity < 0) return validationError("inventory.setQuantity.preview", target, "Inventory quantity must be a non-negative integer.");

  const reason = firstString(input.reason);
  if (!reason) return missingInput("inventory.setQuantity.preview", target, "Provide an inventory adjustment reason.");

  const ignoreCompareQuantity = input.ignoreCompareQuantity === true;
  const compareQuantity = input.compareQuantity === null ? null : integerValue(input.compareQuantity);
  if (!ignoreCompareQuantity && compareQuantity === undefined) {
    return missingInput("inventory.setQuantity.preview", target, "Provide compareQuantity, or explicitly set ignoreCompareQuantity to true.");
  }
  if (compareQuantity !== null && compareQuantity !== undefined && compareQuantity < 0) {
    return validationError("inventory.setQuantity.preview", target, "compareQuantity must be a non-negative integer or null.");
  }

  const referenceDocumentUri = firstString(input.referenceDocumentUri);
  if (referenceDocumentUri && !isValidReferenceUri(referenceDocumentUri)) {
    return validationError("inventory.setQuantity.preview", target, "referenceDocumentUri must be a valid URI with a scheme.");
  }

  const warnings = ignoreCompareQuantity
    ? [warning("compare_quantity_ignored", "compareQuantity checks are explicitly disabled; use only when the user accepts stale inventory risk.")]
    : [];
  const changes = compactChanges([
    { field: "inventoryItemId", action: "plan" as const, value: summarizeValue("inventoryItemId", inventoryItemId) },
    { field: "locationId", action: "plan" as const, value: summarizeValue("locationId", locationId) },
    { field: "quantity", action: "update" as const, before: ignoreCompareQuantity ? "ignored" : compareQuantity, after: quantity },
    { field: "compareQuantity", action: "plan" as const, value: ignoreCompareQuantity ? null : compareQuantity },
    { field: "ignoreCompareQuantity", action: "plan" as const, value: ignoreCompareQuantity },
    { field: "reason", action: "plan" as const, value: summarizeValue("reason", reason) },
    referenceDocumentUri ? { field: "referenceDocumentUri", action: "plan" as const, value: summarizeValue("referenceDocumentUri", referenceDocumentUri) } : undefined
  ]);

  return okResult("inventory.setQuantity.preview", target, `Preview inventory quantity set for ${inventoryItemId}.`, changes, warnings);
}

export function previewInventoryAdjustQuantity(input: Record<string, unknown>): CatalogPreviewResult {
  const inventoryItemId = firstString(input.inventoryItemId, input.inventoryItemID);
  const locationId = firstString(input.locationId, input.locationID);
  const target: PreviewTarget = { type: "inventory", id: inventoryItemId || undefined };
  if (!inventoryItemId) return missingInput("inventory.adjustQuantity.preview", target, "Provide an inventory item ID.");
  if (!locationId) return missingInput("inventory.adjustQuantity.preview", target, "Provide a location ID.");

  const delta = integerValue(input.delta);
  if (delta === undefined || delta === 0) return validationError("inventory.adjustQuantity.preview", target, "Inventory adjustment delta must be a non-zero integer.");

  const reason = firstString(input.reason);
  if (!reason) return missingInput("inventory.adjustQuantity.preview", target, "Provide an inventory adjustment reason.");

  const referenceDocumentUri = firstString(input.referenceDocumentUri);
  if (referenceDocumentUri && !isValidReferenceUri(referenceDocumentUri)) {
    return validationError("inventory.adjustQuantity.preview", target, "referenceDocumentUri must be a valid URI with a scheme.");
  }

  const changes = compactChanges([
    { field: "inventoryItemId", action: "plan" as const, value: summarizeValue("inventoryItemId", inventoryItemId) },
    { field: "locationId", action: "plan" as const, value: summarizeValue("locationId", locationId) },
    { field: "delta", action: "update" as const, before: "current available quantity", after: delta },
    { field: "reason", action: "plan" as const, value: summarizeValue("reason", reason) },
    referenceDocumentUri ? { field: "referenceDocumentUri", action: "plan" as const, value: summarizeValue("referenceDocumentUri", referenceDocumentUri) } : undefined
  ]);

  return okResult("inventory.adjustQuantity.preview", target, `Preview inventory quantity adjustment for ${inventoryItemId}.`, changes, []);
}

export function previewInventoryMoveQuantity(input: Record<string, unknown>): CatalogPreviewResult {
  const inventoryItemId = firstString(input.inventoryItemId, input.inventoryItemID);
  const locationId = firstString(input.locationId, input.locationID);
  const target: PreviewTarget = { type: "inventory", id: inventoryItemId || undefined };
  if (!inventoryItemId) return missingInput("inventory.moveQuantity.preview", target, "Provide an inventory item ID.");
  if (!locationId) return missingInput("inventory.moveQuantity.preview", target, "Provide a location ID.");

  const quantity = integerValue(input.quantity);
  if (quantity === undefined || quantity <= 0) return validationError("inventory.moveQuantity.preview", target, "Inventory move quantity must be a positive integer.");

  const fromName = inventoryQuantityName(input.fromName ?? input.from);
  if (!fromName) return validationError("inventory.moveQuantity.preview", target, "Provide a supported source inventory quantity name.");

  const toName = inventoryQuantityName(input.toName ?? input.to);
  if (!toName) return validationError("inventory.moveQuantity.preview", target, "Provide a supported destination inventory quantity name.");
  if (fromName === toName) return validationError("inventory.moveQuantity.preview", target, "Source and destination inventory quantity names must differ.");

  const reason = firstString(input.reason);
  if (!reason) return missingInput("inventory.moveQuantity.preview", target, "Provide an inventory move reason.");

  const referenceDocumentUri = firstString(input.referenceDocumentUri);
  if (referenceDocumentUri && !isValidReferenceUri(referenceDocumentUri)) {
    return validationError("inventory.moveQuantity.preview", target, "referenceDocumentUri must be a valid URI with a scheme.");
  }

  const changes = compactChanges([
    { field: "inventoryItemId", action: "plan" as const, value: summarizeValue("inventoryItemId", inventoryItemId) },
    { field: "locationId", action: "plan" as const, value: summarizeValue("locationId", locationId) },
    { field: "quantity", action: "update" as const, before: fromName, after: quantity },
    { field: "fromName", action: "plan" as const, value: fromName },
    { field: "toName", action: "plan" as const, value: toName },
    { field: "reason", action: "plan" as const, value: summarizeValue("reason", reason) },
    referenceDocumentUri ? { field: "referenceDocumentUri", action: "plan" as const, value: summarizeValue("referenceDocumentUri", referenceDocumentUri) } : undefined
  ]);

  return okResult("inventory.moveQuantity.preview", target, `Preview inventory quantity move for ${inventoryItemId}.`, changes, []);
}

export function previewInventoryTransfer(input: Record<string, unknown>): CatalogPreviewResult {
  const inventoryItemId = firstString(input.inventoryItemId, input.inventoryItemID);
  const fromLocationId = firstString(input.fromLocationId, input.sourceLocationId, input.sourceLocationID);
  const toLocationId = firstString(input.toLocationId, input.destinationLocationId, input.destinationLocationID);
  const target: PreviewTarget = { type: "inventory", id: inventoryItemId || undefined };
  if (!inventoryItemId) return missingInput("inventory.transfer.preview", target, "Provide an inventory item ID.");
  if (!fromLocationId) return missingInput("inventory.transfer.preview", target, "Provide a source location ID.");
  if (!toLocationId) return missingInput("inventory.transfer.preview", target, "Provide a destination location ID.");
  if (fromLocationId === toLocationId) return validationError("inventory.transfer.preview", target, "Source and destination location IDs must differ.");

  const quantity = integerValue(input.quantity);
  if (quantity === undefined || quantity <= 0) return validationError("inventory.transfer.preview", target, "Inventory transfer quantity must be a positive integer.");

  const reason = firstString(input.reason);
  if (!reason) return missingInput("inventory.transfer.preview", target, "Provide an inventory transfer reason.");

  const referenceDocumentUri = firstString(input.referenceDocumentUri);
  if (referenceDocumentUri && !isValidReferenceUri(referenceDocumentUri)) {
    return validationError("inventory.transfer.preview", target, "referenceDocumentUri must be a valid URI with a scheme.");
  }

  const changes = compactChanges([
    { field: "inventoryItemId", action: "plan" as const, value: summarizeValue("inventoryItemId", inventoryItemId) },
    { field: "fromLocationId", action: "plan" as const, value: summarizeValue("fromLocationId", fromLocationId) },
    { field: "toLocationId", action: "plan" as const, value: summarizeValue("toLocationId", toLocationId) },
    { field: "quantity", action: "update" as const, before: `source ${fromLocationId}`, after: `destination ${toLocationId}` },
    { field: "quantityValue", action: "plan" as const, value: quantity },
    { field: "reason", action: "plan" as const, value: summarizeValue("reason", reason) },
    referenceDocumentUri ? { field: "referenceDocumentUri", action: "plan" as const, value: summarizeValue("referenceDocumentUri", referenceDocumentUri) } : undefined
  ]);
  return okResult("inventory.transfer.preview", target, `Preview inventory transfer for ${inventoryItemId}.`, changes, []);
}

export function previewInventoryTransferMarkReady(input: Record<string, unknown>): CatalogPreviewResult {
  const inventoryTransferId = firstString(input.inventoryTransferId, input.transferId, input.id);
  const currentStatus = firstString(input.currentStatus, input.status);
  const target: PreviewTarget = { type: "inventory_transfer", id: inventoryTransferId || undefined };
  if (!inventoryTransferId) return missingInput("inventory.transfer.markReady.preview", target, "Provide an inventory transfer ID.");

  const changes = compactChanges([
    { field: "inventoryTransferId", action: "plan" as const, value: summarizeValue("inventoryTransferId", inventoryTransferId) },
    { field: "status", action: "update" as const, before: currentStatus || "unknown", after: "READY_TO_SHIP" }
  ]);

  return okResult("inventory.transfer.markReady.preview", target, `Preview marking inventory transfer ${inventoryTransferId} ready to ship.`, changes, []);
}

export function previewInventoryTransferCancel(input: Record<string, unknown>): CatalogPreviewResult {
  const inventoryTransferId = firstString(input.inventoryTransferId, input.transferId, input.id);
  const currentStatus = firstString(input.currentStatus, input.status);
  const target: PreviewTarget = { type: "inventory_transfer", id: inventoryTransferId || undefined };
  if (!inventoryTransferId) return missingInput("inventory.transfer.cancel.preview", target, "Provide an inventory transfer ID.");

  const changes = compactChanges([
    { field: "inventoryTransferId", action: "plan" as const, value: summarizeValue("inventoryTransferId", inventoryTransferId) },
    { field: "status", action: "update" as const, before: currentStatus || "unknown", after: "CANCELLED" }
  ]);

  return okResult("inventory.transfer.cancel.preview", target, `Preview cancelling inventory transfer ${inventoryTransferId}.`, changes, []);
}

export function previewInventoryTransferShip(input: Record<string, unknown>): CatalogPreviewResult {
  const inventoryTransferId = firstString(input.inventoryTransferId, input.transferId, input.id);
  const inventoryItemId = firstString(input.inventoryItemId, input.inventoryItemID);
  const currentStatus = firstString(input.currentStatus, input.status);
  const target: PreviewTarget = { type: "inventory_transfer", id: inventoryTransferId || undefined };
  if (!inventoryTransferId) return missingInput("inventory.transfer.ship.preview", target, "Provide an inventory transfer ID.");
  if (!inventoryItemId) return missingInput("inventory.transfer.ship.preview", target, "Provide an inventory item ID.");

  const quantity = integerValue(input.quantity);
  if (quantity === undefined || quantity <= 0) return validationError("inventory.transfer.ship.preview", target, "Inventory transfer shipment quantity must be a positive integer.");

  const changes = compactChanges([
    { field: "inventoryTransferId", action: "plan" as const, value: summarizeValue("inventoryTransferId", inventoryTransferId) },
    { field: "inventoryItemId", action: "plan" as const, value: summarizeValue("inventoryItemId", inventoryItemId) },
    { field: "quantity", action: "update" as const, before: currentStatus || "READY_TO_SHIP", after: "IN_TRANSIT" },
    { field: "quantityValue", action: "plan" as const, value: quantity }
  ]);

  return okResult("inventory.transfer.ship.preview", target, `Preview shipping ${quantity} unit${quantity === 1 ? "" : "s"} from inventory transfer ${inventoryTransferId}.`, changes, []);
}

export function previewInventoryTransferReceive(input: Record<string, unknown>): CatalogPreviewResult {
  const inventoryShipmentId = firstString(input.inventoryShipmentId, input.shipmentId, input.id);
  const shipmentLineItemId = firstString(input.shipmentLineItemId, input.lineItemId, input.inventoryShipmentLineItemId);
  const currentStatus = firstString(input.currentStatus, input.status);
  const reason = receiveReason(input.reason);
  const target: PreviewTarget = { type: "inventory_shipment", id: inventoryShipmentId || undefined };
  if (!inventoryShipmentId) return missingInput("inventory.transfer.receive.preview", target, "Provide an inventory shipment ID.");
  if (!shipmentLineItemId) return missingInput("inventory.transfer.receive.preview", target, "Provide an inventory shipment line item ID.");

  const quantity = integerValue(input.quantity);
  if (quantity === undefined || quantity <= 0) return validationError("inventory.transfer.receive.preview", target, "Inventory transfer receive quantity must be a positive integer.");
  if (!reason) return validationError("inventory.transfer.receive.preview", target, "Inventory transfer receive reason must be ACCEPTED or REJECTED.");

  const changes = compactChanges([
    { field: "inventoryShipmentId", action: "plan" as const, value: summarizeValue("inventoryShipmentId", inventoryShipmentId) },
    { field: "shipmentLineItemId", action: "plan" as const, value: summarizeValue("shipmentLineItemId", shipmentLineItemId) },
    { field: "quantity", action: "update" as const, before: currentStatus || "IN_TRANSIT", after: "RECEIVED" },
    { field: "quantityValue", action: "plan" as const, value: quantity },
    { field: "reason", action: "plan" as const, value: reason }
  ]);

  return okResult("inventory.transfer.receive.preview", target, `Preview receiving ${quantity} unit${quantity === 1 ? "" : "s"} for inventory shipment ${inventoryShipmentId}.`, changes, []);
}

export function previewPageCreate(input: Record<string, unknown>): CatalogPreviewResult {
  const title = firstString(input.title);
  const body = firstString(input.body, input.content, input.bodyHtml);
  const target: PreviewTarget = { type: "page", title: title || undefined, handle: firstString(input.handle) || undefined };
  if (!title) return missingInput("page.create.preview", target, "Provide a page title.");
  if (!body) return missingInput("page.create.preview", target, "Provide page body/content.");

  const warnings: PreviewWarning[] = [];
  if (!target.handle) warnings.push(warning("missing_handle", "No page handle was provided; Shopify may generate one later."));
  if (body.length > 5000) warnings.push(warning("large_content", "Page content is large and was summarized in the preview output."));

  const changes = compactChanges([
    createChange("title", title),
    createChange("body", contentSummary(body)),
    createChange("handle", target.handle),
    createChange("seo", summarizeObject(input.seo)),
    createChange("publishPreference", summarizeValue("publishPreference", input.publishPreference ?? input.published))
  ]);
  return okResult("page.create.preview", target, `Preview page creation for "${title}".`, changes, warnings);
}

export function previewCollectionCreate(input: Record<string, unknown>): CatalogPreviewResult {
  const title = firstString(input.title);
  const target: PreviewTarget = { type: "collection", title: title || undefined, handle: firstString(input.handle) || undefined };
  if (!title) return missingInput("collection.create.preview", target, "Provide a collection title.");

  const productIds = arrayInput(input.productIds) ?? arrayInput(input.products);
  const rules = arrayInput(input.rules) ?? objectAsArray(input.rules);
  if (input.productIds !== undefined && !arrayInput(input.productIds)) return validationError("collection.create.preview", target, "Product IDs must be provided as an array.");
  if (input.rules !== undefined && !rules) return validationError("collection.create.preview", target, "Collection rules must be provided as an object or array.");
  if (!productIds?.length && !rules?.length) return missingInput("collection.create.preview", target, "Provide explicit product IDs or explicit collection rules.");

  const changes = compactChanges([
    createChange("title", title),
    createChange("handle", target.handle),
    productIds?.length ? {
      field: "productIds",
      action: "add" as const,
      summary: `${productIds.length} explicit product ID${productIds.length === 1 ? "" : "s"} supplied`,
      value: productIds.map((id) => summarizeValue("productId", id))
    } : undefined,
    rules?.length ? {
      field: "rules",
      action: "create" as const,
      summary: `${rules.length} explicit collection rule${rules.length === 1 ? "" : "s"} supplied`,
      value: rules.map((rule) => summarizeValue("rule", rule))
    } : undefined,
    createChange("seo", summarizeObject(input.seo)),
    createChange("publishPreference", summarizeValue("publishPreference", input.publishPreference ?? input.published))
  ]);
  const warnings = productIds?.length && rules?.length ? [warning("mixed_collection_inputs", "Both explicit product IDs and rules were supplied; review the intended collection type before execution exists.")] : [];
  return okResult("collection.create.preview", target, `Preview collection creation for "${title}".`, changes, warnings);
}

function okResult(tool: PreviewTool, target: PreviewTarget, summary: string, proposedChanges: PreviewChange[], warnings: PreviewWarning[] = []): CatalogPreviewResult {
  return buildResult(tool, "ok", target, summary, proposedChanges, warnings);
}

function missingInput(tool: PreviewTool, target: PreviewTarget, summary: string): CatalogPreviewResult {
  return buildResult(tool, "missing_input", target, summary, [], [warning("missing_input", summary)]);
}

function validationError(tool: PreviewTool, target: PreviewTarget, summary: string): CatalogPreviewResult {
  return buildResult(tool, "validation_error", target, summary, [], [warning("validation_error", summary)]);
}

function buildResult(
  tool: PreviewTool,
  status: CatalogPreviewStatus,
  target: PreviewTarget,
  summary: string,
  proposedChanges: PreviewChange[],
  warnings: PreviewWarning[]
): CatalogPreviewResult {
  const safeTarget = sanitizeTarget(target);
  const auditTarget = targetLabel(safeTarget);
  const safeSummary = safeString(summary, maxSummaryLength);
  return {
    ok: status === "ok",
    status,
    previewId: previewId(tool, auditTarget, proposedChanges),
    summary: safeSummary,
    target: safeTarget,
    proposedChanges,
    warnings,
    requiredConfirmationForExecute,
    auditContext: {
      tool,
      mode: "preview",
      target: auditTarget,
      requiresExecuteConfirmation: true,
      performsShopifyMutation: false,
      usesShopifyWriteOperation: false
    }
  };
}

function sanitizeTarget(target: PreviewTarget): PreviewTarget {
  return {
    type: target.type,
    id: target.id ? safeString(target.id, maxScalarLength) : undefined,
    handle: target.handle ? safeString(target.handle, maxScalarLength) : undefined,
    title: target.title ? safeString(target.title, maxScalarLength) : undefined,
    url: target.url ? sanitizeUrl(target.url) : undefined
  };
}

function productTarget(input: Record<string, unknown>): PreviewTarget {
  return {
    type: "product",
    id: firstString(input.productId, input.id) || undefined,
    handle: firstString(input.handle) || undefined,
    title: firstString(input.title) || undefined
  };
}

function targetLabel(target: PreviewTarget): string {
  return target.id ?? target.handle ?? target.title ?? target.url ?? target.type;
}

function updatePayload(input: Record<string, unknown>, excludedKeys: string[]): Record<string, unknown> {
  const changes = objectInput(input.changes);
  const source = changes ?? input;
  const excluded = new Set([...excludedKeys, "changes", "confirmed", "previewId"]);
  return Object.fromEntries(Object.entries(source).filter(([key, value]) => !excluded.has(key) && value !== undefined));
}

function previewId(tool: PreviewTool, target: string, proposedChanges: PreviewChange[]): string {
  const hashInput = JSON.stringify({ tool, target, proposedChanges });
  let hash = 0;
  for (let index = 0; index < hashInput.length; index += 1) {
    hash = (hash * 31 + hashInput.charCodeAt(index)) >>> 0;
  }
  return `preview_${hash.toString(16).padStart(8, "0")}`;
}

function compactChanges(changes: Array<PreviewChange | undefined>): PreviewChange[] {
  return changes.filter((change): change is PreviewChange => Boolean(change));
}

function createChange(field: string, value: unknown): PreviewChange | undefined {
  if (value === undefined || value === "" || value === omitted) return undefined;
  return { field, action: "create", value: summarizeValue(field, value) };
}

function mediaChange(field: string, action: "add" | "update" | "delete" | "reorder", items: unknown[]): PreviewChange {
  return {
    field,
    action,
    summary: `${items.length} item${items.length === 1 ? "" : "s"}`,
    value: summarizeMedia(items)
  };
}

function warning(code: string, message: string): PreviewWarning {
  return { code, message };
}

function firstString(...values: unknown[]): string {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return "";
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function integerValue(value: unknown): number | undefined {
  return typeof value === "number" && Number.isInteger(value) ? value : undefined;
}

function receiveReason(value: unknown): "ACCEPTED" | "REJECTED" | undefined {
  const text = stringValue(value)?.toUpperCase();
  return text === "ACCEPTED" || text === "REJECTED" ? text : undefined;
}

function inventoryQuantityName(value: unknown): string | undefined {
  const text = stringValue(value)?.toLowerCase();
  return text && ["available", "reserved", "damaged", "quality_control", "safety_stock"].includes(text) ? text : undefined;
}

function arrayInput(value: unknown): unknown[] | undefined {
  return Array.isArray(value) ? value : undefined;
}

function objectInput(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
}

function objectAsArray(value: unknown): unknown[] | undefined {
  const object = objectInput(value);
  return object ? [object] : undefined;
}

function tagSummary(value: unknown): unknown {
  if (Array.isArray(value)) return value.slice(0, 20).map((tag) => summarizeValue("tag", tag));
  if (typeof value === "string" && value.trim()) return value.split(",").map((tag) => summarizeValue("tag", tag.trim())).filter(Boolean).slice(0, 20);
  return undefined;
}

function summarizeVariants(variants: unknown[]): unknown[] {
  return variants.slice(0, 10).map((variant) => summarizeValue("variant", variant));
}

function summarizeUpdateValue(field: string, value: unknown): unknown {
  if (field === "variants" && Array.isArray(value)) return summarizeUpdateVariants(value);
  if (field === "options" && Array.isArray(value)) return summarizeUpdateOptions(value);
  if (isOptionOrderField(field) && Array.isArray(value)) return summarizeOptionOrder(value);
  return summarizeValue(field, value);
}

function summarizeUpdateVariants(variants: unknown[]): unknown {
  return {
    count: variants.length,
    items: variants.slice(0, 10).map((variant) => {
      const object = objectInput(variant);
      if (!object) return summarizeValue("variant", variant);
      const optionValues = summarizeVariantOptionValues(object.optionValues ?? object.options ?? object.selectedOptions);
      const fields = Object.fromEntries(Object.entries({
        id: summarizeValue("id", object.id),
        variantId: summarizeValue("variantId", object.variantId),
        price: summarizeValue("price", object.price),
        sku: summarizeValue("sku", object.sku),
        optionValues
      }).filter(([, entryValue]) => entryValue !== undefined));
      return {
        fields,
        omittedFieldCount: Math.max(0, Object.keys(object).length - Object.keys(fields).length)
      };
    })
  };
}

function summarizeVariantOptionValues(value: unknown): unknown {
  if (!Array.isArray(value)) return undefined;
  const entries: string[] = [];
  for (const item of value.slice(0, 3)) {
    const fields = objectInput(item);
    if (!fields) continue;
    const explicitOptionName = stringValue(fields.optionName);
    const optionName = explicitOptionName ?? stringValue(fields.name) ?? stringValue(fields.option);
    const name = explicitOptionName
      ? stringValue(fields.name) ?? stringValue(fields.value) ?? stringValue(fields.optionValue) ?? stringValue(fields.optionValueName)
      : stringValue(fields.value) ?? stringValue(fields.optionValue) ?? stringValue(fields.optionValueName);
    if (!optionName || !name) continue;
    entries.push(`${safeString(optionName, 120)}=${safeString(name, 180)}`);
  }
  return entries.length > 0 ? entries : undefined;
}

function summarizeUpdateOptions(options: unknown[]): unknown {
  return {
    count: options.length,
    items: options.slice(0, 3).map((option) => {
      const object = objectInput(option);
      if (!object) return summarizeValue("option", option);
      const id = summarizeValue("id", object.id ?? object.optionId);
      const name = summarizeValue("name", object.name ?? object.optionName);
      const values = summarizeOptionValues(object.values ?? object.optionValues);
      const deleteValueIds = summarizeOptionValueIds(object.deleteValueIds ?? object.deletedValueIds ?? object.valuesToDelete ?? object.optionValuesToDelete ?? object.deleteValues);
      const deleteOption = object.delete === true || object.remove === true || object.destroy === true || object.deleteOption === true ? true : undefined;
      const position = summarizeValue("position", object.position ?? object.newPosition ?? object.order);
      const reorder = object.reorder === true || object.reorderOption === true || position !== undefined ? true : undefined;
      const fields = Object.fromEntries(Object.entries({ id, name, values, deleteValueIds, deleteOption, position, reorder }).filter(([, entryValue]) => entryValue !== undefined));
      return {
        fields,
        omittedFieldCount: Math.max(0, Object.keys(object).length - Object.keys(fields).length)
      };
    })
  };
}

function summarizeOptionValues(value: unknown): unknown {
  if (!Array.isArray(value)) return undefined;
  const values = value.slice(0, 25)
    .map((item) => {
      if (typeof item === "string") return safeString(item, 120);
      const fields = objectInput(item);
      if (!fields) return undefined;
      const id = stringValue(fields.id ?? fields.optionValueId);
      const name = stringValue(fields.name ?? fields.value);
      if (id && name) return `${safeString(id, 180)}=${safeString(name, 120)}`;
      return name ? safeString(name, 120) : undefined;
    })
    .filter(Boolean);
  return values.length > 0 ? values : undefined;
}

function summarizeOptionOrder(options: unknown[]): unknown {
  return {
    count: options.length,
    items: options.slice(0, 3).map((option) => {
      const object = objectInput(option);
      if (!object) return summarizeValue("option", option);
      const id = summarizeValue("id", object.id ?? object.optionId);
      const name = summarizeValue("name", object.name ?? object.optionName);
      const values = summarizeOptionOrderValues(object.values ?? object.optionValues ?? object.valueOrder ?? object.optionValueOrder);
      const fields = Object.fromEntries(Object.entries({ id, name, values }).filter(([, entryValue]) => entryValue !== undefined));
      return {
        fields,
        omittedFieldCount: Math.max(0, Object.keys(object).length - Object.keys(fields).length)
      };
    })
  };
}

function isOptionOrderField(field: string): boolean {
  return field === "optionOrder" || field === "optionsOrder" || field === "reorderOptions" || field === "productOptionsOrder";
}

function summarizeOptionOrderValues(value: unknown): unknown {
  if (!Array.isArray(value)) return undefined;
  const values = value.slice(0, 25)
    .map((item) => {
      if (typeof item === "string") return safeString(item, 180);
      const fields = objectInput(item);
      if (!fields) return undefined;
      const id = stringValue(fields.id ?? fields.optionValueId);
      const name = stringValue(fields.name ?? fields.value);
      return id ? safeString(id, 180) : name ? safeString(name, 120) : undefined;
    })
    .filter(Boolean);
  return values.length > 0 ? values : undefined;
}

function summarizeOptionValueIds(value: unknown): unknown {
  if (!Array.isArray(value)) return undefined;
  const ids = value.slice(0, 25)
    .map((item) => {
      if (typeof item === "string") return safeString(item, 180);
      const fields = objectInput(item);
      const id = fields ? stringValue(fields.id ?? fields.optionValueId) : undefined;
      return id ? safeString(id, 180) : undefined;
    })
    .filter(Boolean);
  return ids.length > 0 ? ids : undefined;
}

function summarizeMedia(media: unknown[]): unknown[] {
  return media.slice(0, 10).map((item) => summarizeValue("media", item));
}

function summarizeObject(value: unknown): unknown {
  const object = objectInput(value);
  if (!object) return undefined;
  return summarizeValue("object", object);
}

function countSummary(value: unknown, label: string): string | undefined {
  if (!Array.isArray(value)) return undefined;
  return `${value.length} ${label}${value.length === 1 ? "" : "s"} supplied`;
}

function contentSummary(value: string): unknown {
  if (!value) return undefined;
  return {
    length: value.length,
    excerpt: safeString(value.replace(/\s+/g, " "), 160)
  };
}

function summarizeValue(key: string, value: unknown): unknown {
  if (value === undefined) return undefined;
  if (isSecretKey(key)) return redacted;
  if (key.toLowerCase().includes("url") && typeof value === "string") return sanitizeUrl(value);
  if (typeof value === "string") return safeString(value, maxScalarLength);
  if (typeof value === "number" || typeof value === "boolean" || value === null) return value;
  if (Array.isArray(value)) {
    return {
      count: value.length,
      items: value.slice(0, 10).map((item) => summarizeValue(key, item))
    };
  }
  const object = objectInput(value);
  if (!object) return omitted;
  const entries = Object.entries(object).slice(0, 12).map(([entryKey, entryValue]) => [entryKey, summarizeValue(entryKey, entryValue)]);
  return {
    fields: Object.fromEntries(entries),
    omittedFieldCount: Math.max(0, Object.keys(object).length - entries.length)
  };
}

function safeString(value: string, maxLength: number): string {
  if (looksLikeSecret(value)) return redacted;
  const normalized = value.trim();
  return normalized.length > maxLength ? `${normalized.slice(0, maxLength)}...` : normalized;
}

function sanitizeUrl(value: string): string {
  try {
    const url = new URL(value.trim());
    url.username = "";
    url.password = "";
    for (const [key, paramValue] of url.searchParams.entries()) {
      if (isSensitiveQueryKey(key) || looksLikeSecret(paramValue)) url.searchParams.set(key, redacted);
    }
    return safeString(url.toString(), maxScalarLength);
  } catch {
    return safeString(value, maxScalarLength);
  }
}

function isSecretKey(key: string): boolean {
  return /token|secret|password|authorization|access[_-]?token|api[_-]?key|client[_-]?secret|key/i.test(key);
}

function isSensitiveQueryKey(key: string): boolean {
  return /token|secret|password|authorization|access[_-]?token|accessToken|api[_-]?key|client[_-]?secret|key/i.test(key);
}

function looksLikeSecret(value: string): boolean {
  return /shpat_[A-Za-z0-9_]+|shpua_[A-Za-z0-9_]+|ghp_[A-Za-z0-9_]+|Bearer\s+[A-Za-z0-9._-]+/i.test(value);
}

function isProductStatus(value: string): boolean {
  return ["ACTIVE", "DRAFT", "ARCHIVED"].includes(value.toUpperCase());
}

function isValidPrice(value: unknown): boolean {
  if (typeof value === "number") return Number.isFinite(value) && value >= 0;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed >= 0;
  }
  return false;
}

function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

function isValidReferenceUri(value: string): boolean {
  try {
    const url = new URL(value);
    return Boolean(url.protocol && url.pathname);
  } catch {
    return false;
  }
}
