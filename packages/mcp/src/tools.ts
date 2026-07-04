import {
  type AuditLog,
  FileAuditLog,
  assertWritable,
  checkShopifyCapabilities,
  checkWriteScopePreflight,
  type CatalogPreviewResult,
  createBulkPreview,
  createCollection,
  createConfig,
  createPage,
  createRefundPreview,
  emptyCapabilities,
  type ExecutePreviewBindingResult,
  type ExecutePreviewBindingDiagnostic,
  type FetchLike,
  findCustomers,
  findOrders,
  getOrder,
  getProduct,
  getTracking,
  lookupInventory,
  type InventorySetQuantityInput,
  type InventorySetQuantityResult,
  loadStoredConfig,
  defaultAuditLogPath,
  defaultPreviewStorePath,
  FilePreviewStore,
  MemoryPreviewStore,
  hashPreviewContent,
  planThemeSection,
  previewRecordBindingTarget,
  reviewedPayloadForPreviewRecord,
  type PageCreateInput,
  type PageCreateResult,
  type CollectionCreateInput,
  type CollectionCreateResult,
  type ProductCreateInput,
  type ProductCreateResult,
  type ProductOptionsCreateInput,
  type ProductOptionsCreateResult,
  type ProductOptionsDeleteInput,
  type ProductOptionsDeleteResult,
  type ProductOptionsReorderInput,
  type ProductOptionsReorderResult,
  type ProductOptionValueAddInput,
  type ProductOptionValueAddResult,
  type ProductOptionValueDeleteInput,
  type ProductOptionValueDeleteResult,
  type ProductOptionValueRenameInput,
  type ProductOptionValueRenameResult,
  type ProductOptionRenameInput,
  type ProductOptionRenameResult,
  type ProductUpdateInput,
  type ProductUpdateResult,
  type ProductVariantBulkCreateInput,
  type ProductVariantBulkCreateResult,
  type ProductVariantPriceUpdateInput,
  type ProductVariantPriceUpdateResult,
  type PreviewWarning,
  type ProductSummary,
  type ReadResult,
  type StoredPreviewRecord,
  validateExecutePreviewBinding,
  verifyStoredPreviewBinding,
  addProductOptionValues,
  createProduct,
  createProductOptions,
  createProductVariants,
  deleteProductOptions,
  deleteProductOptionValues,
  renameProductOption,
  renameProductOptionValue,
  reorderProductOptions,
  setInventoryQuantity,
  updateProduct,
  updateProductVariantPrices,
  previewCollectionCreate,
  previewInventorySetQuantity,
  previewPageCreate,
  previewProductCreate,
  previewProductImportFromUserUrl,
  previewProductMediaUpdate,
  previewProductUpdate,
  type StoreAgentConfig
} from "@shopify-store-agent/core";
import { dirname, join } from "node:path";

export interface ToolDefinition {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  handler: (input: Record<string, unknown>, context: ToolContext) => Promise<unknown> | unknown;
}

export interface ToolContext {
  config: StoreAgentConfig;
  audit: AuditLog;
  fetcher?: FetchLike;
  previewStore?: MemoryPreviewStore;
}

function booleanInput(input: Record<string, unknown>, key: string): boolean {
  return input[key] === true;
}

function stringInput(input: Record<string, unknown>, key: string, fallback = ""): string {
  const value = input[key];
  return typeof value === "string" ? value : fallback;
}

function objectInput(input: Record<string, unknown>, key: string): Record<string, unknown> | undefined {
  const value = input[key];
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
}

function previewResult(tool: string, target: string, summary: string, context: ToolContext): Record<string, unknown> {
  const audit = context.audit.record({
    tool,
    target,
    mode: "preview",
    summary,
    result: "success"
  });
  const stored = savePreviewRecord(context, {
    previewId: undefined,
    tool,
    target,
    summary,
    proposedChanges: [],
    requiredConfirmationForExecute: "Execute is not implemented. Future execute tools must require this preview binding.",
    auditContext: {
      tool,
      mode: "preview",
      target,
      requiresExecuteConfirmation: true,
      performsShopifyMutation: false,
      usesShopifyWriteOperation: false
    }
  });
  return { ok: true, mode: "preview", summary, audit, previewId: stored.previewId, previewHash: stored.previewHash, binding: previewBindingOutput(stored) };
}

function catalogPreviewResult(result: CatalogPreviewResult, context: ToolContext): Record<string, unknown> {
  const audit = context.audit.record({
    tool: result.auditContext.tool,
    target: result.auditContext.target,
    mode: "preview",
    summary: result.summary,
    result: result.status === "ok" ? "success" : "blocked"
  });
  const stored = savePreviewRecord(context, {
    tool: result.auditContext.tool,
    target: result.target,
    summary: result.summary,
    proposedChanges: result.proposedChanges,
    requiredConfirmationForExecute: result.requiredConfirmationForExecute,
    auditContext: result.auditContext
  });
  return {
    ...result,
    mode: "preview",
    audit,
    previewId: stored.previewId,
    previewHash: stored.previewHash,
    binding: previewBindingOutput(stored),
    executeRequest: result.status === "ok" ? previewExecuteRequest(stored) : undefined
  };
}

function previewExecuteRequest(record: StoredPreviewRecord): Record<string, unknown> | undefined {
  const executeTool = implementedExecuteToolForPreview(record.tool);
  if (!executeTool) return undefined;
  const reviewedPayload = reviewedPayloadForPreviewRecord(record);
  const reviewedChangesHash = hashPreviewContent(reviewedPayload);
  return {
    tool: executeTool,
    requiresConfirmation: true,
    confirmationField: "confirmed",
    confirmValue: true,
    previewId: record.previewId,
    expectedTool: record.tool,
    target: previewRecordBindingTarget(record),
    previewHash: record.previewHash,
    reviewedPayload,
    reviewedChangesHash,
    instructions: "Review this preview with the user. Only call execute with confirmed: true after explicit user approval."
  };
}

function implementedExecuteToolForPreview(previewTool: string): string | undefined {
  if (previewTool === "product.create.preview") return "product.create.execute";
  if (previewTool === "page.create.preview") return "page.create.execute";
  if (previewTool === "collection.create.preview") return "collection.create.execute";
  if (previewTool === "inventory.setQuantity.preview") return "inventory.setQuantity.execute";
  return undefined;
}

async function productUpdatePreviewResult(input: Record<string, unknown>, context: ToolContext): Promise<Record<string, unknown>> {
  const enriched = await enrichProductUpdateInput(input, context);
  const result = previewProductUpdate(enriched.input);
  if (enriched.warning) result.warnings.push(enriched.warning);
  return catalogPreviewResult(result, context);
}

async function enrichProductUpdateInput(
  input: Record<string, unknown>,
  context: ToolContext
): Promise<{ input: Record<string, unknown>; warning?: PreviewWarning }> {
  if (!booleanInput(input, "enrichExistingProduct")) return { input };
  if (objectInput(input, "existingProduct") || objectInput(input, "existingProductSummary")) return { input };

  const productId = stringInput(input, "productId");
  const id = stringInput(input, "id");
  const handle = stringInput(input, "handle");
  if (!productId && !id && !handle) return { input };
  if (!hasProductUpdateChanges(input)) return { input };

  let read: ReadResult<ProductSummary>;
  try {
    read = await getProduct(context.config, {
      id: id || undefined,
      productId: productId || undefined,
      handle: handle || undefined
    }, { fetcher: context.fetcher });
  } catch {
    return {
      input,
      warning: readEnrichmentWarning()
    };
  }
  if (read.item) return { input: { ...input, existingProductSummary: minimalProductBefore(read.item) } };

  return {
    input,
    warning: readEnrichmentWarning(read)
  };
}

function hasProductUpdateChanges(input: Record<string, unknown>): boolean {
  const changes = objectInput(input, "changes");
  if (changes) return Object.keys(changes).length > 0;
  const excluded = new Set(["id", "productId", "handle", "existingProduct", "existingProductSummary", "enrichExistingProduct", "confirmed", "previewId"]);
  return Object.entries(input).some(([key, value]) => !excluded.has(key) && value !== undefined);
}

function minimalProductBefore(product: ProductSummary): ProductSummary {
  return {
    id: product.id,
    title: product.title,
    handle: product.handle,
    status: product.status,
    vendor: product.vendor,
    productType: product.productType
  };
}

function readEnrichmentWarning(read?: ReadResult<ProductSummary>): PreviewWarning {
  const reason = read ? ` (${read.status})` : "";
  return {
    code: "read_enrichment_unavailable",
    message: `Read-only product enrichment was unavailable${reason}; before values remain unknown.`
  };
}

function readResult(tool: string, target: string, summary: string, context: ToolContext, extra: Record<string, unknown> = {}): Record<string, unknown> {
  const audit = context.audit.record({
    tool,
    target,
    mode: "read",
    summary,
    result: "success"
  });
  return { ok: true, mode: "read", summary, audit, ...extra };
}

async function shopifyReadResult(
  tool: string,
  target: string,
  summary: string,
  context: ToolContext,
  resultPromise: Promise<unknown>
): Promise<Record<string, unknown>> {
  const result = await resultPromise;
  const ok = typeof result === "object" && result !== null && "ok" in result && typeof result.ok === "boolean" ? result.ok : true;
  const auditResult = auditResultForRead(result);
  const audit = context.audit.record({
    tool,
    target,
    mode: "read",
    summary,
    result: auditResult
  });
  return { ok, mode: "read", audit, result };
}

function auditResultForRead(result: unknown): "success" | "blocked" | "failed" {
  if (!result || typeof result !== "object" || !("status" in result)) return "failed";
  const status = (result as { status: unknown }).status;
  if (status === "ok" || status === "not_found" || status === "multiple_matches") return "success";
  if (status === "missing_input") return "blocked";
  if (status === "shopify_error" || status === "invalid_response") return "failed";
  return "failed";
}

function executePlaceholder(tool: string, target: string, summary: string, input: Record<string, unknown>, context: ToolContext): Record<string, unknown> {
  assertWritable(context.config, tool, true);
  const safeTarget = safeExecuteString(target);
  const prepared = prepareExecuteBinding(tool, safeTarget, input, context);
  const binding = prepared.binding ?? validateExecutePreviewBinding(input, {
    executeTool: tool,
    expectedPreviewTool: expectedPreviewTool(tool),
    target: prepared.target
  });
  if (!binding.ok) return blockedExecuteResult(tool, safeTarget, binding, context);

  const notImplementedSummary = `${summary} No Shopify change was made because this execute tool is not implemented yet.`;
  const audit = context.audit.record({
    tool,
    target: safeTarget,
    mode: "execute",
    summary: notImplementedSummary,
    result: "not_implemented"
  });
  return {
    ok: false,
    mode: "execute",
    implemented: false,
    status: "not_implemented",
    summary: notImplementedSummary,
    audit,
    previewBinding: {
      previewId: binding.previewId,
      expectedTool: binding.expectedPreviewTool,
      target: binding.target
    },
    placeholder: true
  };
}

async function pageCreateExecuteResult(input: Record<string, unknown>, context: ToolContext): Promise<Record<string, unknown>> {
  const tool = "page.create.execute";
  const target = pageExecuteTarget(input, context);

  if (context.config.readOnly) {
    return blockedImplementedExecuteResult(tool, target, [diagnostic("read_only", "Execute is blocked because read-only mode is enabled.")], context);
  }

  if (!context.previewStore) {
    return blockedImplementedExecuteResult(tool, target, [diagnostic("stored_preview_missing", "Stored preview was not found; execute binding fails closed.")], context);
  }

  const lookup = context.previewStore.getPreview(stringInput(input, "previewId"));
  const storedTarget = lookup.record ? previewRecordBindingTarget(lookup.record) : target;
  const binding = verifyStoredPreviewBinding(context.previewStore, input, {
    executeTool: tool,
    expectedPreviewTool: "page.create.preview",
    target: storedTarget
  });
  if (!stringInput(input, "target")) {
    binding.ok = false;
    binding.diagnostics = [
      diagnostic("missing_target", "Execute requires the reviewed preview target."),
      ...binding.diagnostics.filter((item) => item.code !== "missing_target")
    ];
  }
  if (!binding.ok) return blockedImplementedExecuteResult(tool, storedTarget, binding.diagnostics, context, binding);
  if (!lookup.ok || !lookup.record) {
    return blockedImplementedExecuteResult(tool, storedTarget, [lookup.diagnostic ?? diagnostic("stored_preview_missing", "Stored preview was not found; execute binding fails closed.")], context, binding);
  }
  if (lookup.record.tool !== "page.create.preview") {
    return blockedImplementedExecuteResult(tool, storedTarget, [diagnostic("stored_preview_tool_mismatch", "Stored preview is not a page creation preview.")], context, binding);
  }

  const extracted = pageCreateInputFromStoredPreview(lookup.record);
  if (!extracted.ok) return blockedImplementedExecuteResult(tool, storedTarget, extracted.diagnostics, context, binding);

  const preflight = checkWriteScopePreflight(context.config, tool);
  if (!preflight.ok) return blockedImplementedExecuteResult(tool, storedTarget, preflight.diagnostics, context, binding);

  const write = await createPage(context.config, extracted.input, { fetcher: context.fetcher });
  return pageCreateWriteResult(tool, storedTarget, binding, write, context);
}

async function productCreateExecuteResult(input: Record<string, unknown>, context: ToolContext): Promise<Record<string, unknown>> {
  const tool = "product.create.execute";
  const target = productExecuteTarget(input, context);

  if (context.config.readOnly) {
    return blockedImplementedExecuteResult(tool, target, [diagnostic("read_only", "Execute is blocked because read-only mode is enabled.")], context, "product.create.preview");
  }

  if (!context.previewStore) {
    return blockedImplementedExecuteResult(tool, target, [diagnostic("stored_preview_missing", "Stored preview was not found; execute binding fails closed.")], context, "product.create.preview");
  }

  const lookup = context.previewStore.getPreview(stringInput(input, "previewId"));
  const storedTarget = lookup.record ? previewRecordBindingTarget(lookup.record) : target;
  const binding = verifyStoredPreviewBinding(context.previewStore, input, {
    executeTool: tool,
    expectedPreviewTool: "product.create.preview",
    target: storedTarget
  });
  if (!stringInput(input, "target")) {
    binding.ok = false;
    binding.diagnostics = [
      diagnostic("missing_target", "Execute requires the reviewed preview target."),
      ...binding.diagnostics.filter((item) => item.code !== "missing_target")
    ];
  }
  if (!binding.ok) return blockedImplementedExecuteResult(tool, storedTarget, binding.diagnostics, context, binding);
  if (!lookup.ok || !lookup.record) {
    return blockedImplementedExecuteResult(tool, storedTarget, [lookup.diagnostic ?? diagnostic("stored_preview_missing", "Stored preview was not found; execute binding fails closed.")], context, binding);
  }
  if (lookup.record.tool !== "product.create.preview") {
    return blockedImplementedExecuteResult(tool, storedTarget, [diagnostic("stored_preview_tool_mismatch", "Stored preview is not a product creation preview.")], context, binding);
  }

  const extracted = productCreateInputFromStoredPreview(lookup.record);
  if (!extracted.ok) return blockedImplementedExecuteResult(tool, storedTarget, extracted.diagnostics, context, binding);

  const preflight = checkWriteScopePreflight(context.config, tool);
  if (!preflight.ok) return blockedImplementedExecuteResult(tool, storedTarget, preflight.diagnostics, context, binding);

  const write = await createProduct(context.config, extracted.input, { fetcher: context.fetcher });
  return productCreateWriteResult(tool, storedTarget, binding, write, context);
}

async function productUpdateExecuteResult(input: Record<string, unknown>, context: ToolContext): Promise<Record<string, unknown>> {
  const tool = "product.update.execute";
  const target = productExecuteTarget(input, context);

  if (context.config.readOnly) {
    return blockedImplementedExecuteResult(tool, target, [diagnostic("read_only", "Execute is blocked because read-only mode is enabled.")], context, "product.update.preview");
  }

  if (!context.previewStore) {
    return blockedImplementedExecuteResult(tool, target, [diagnostic("stored_preview_missing", "Stored preview was not found; execute binding fails closed.")], context, "product.update.preview");
  }

  const lookup = context.previewStore.getPreview(stringInput(input, "previewId"));
  const storedTarget = lookup.record ? previewRecordBindingTarget(lookup.record) : target;
  const binding = verifyStoredPreviewBinding(context.previewStore, input, {
    executeTool: tool,
    expectedPreviewTool: "product.update.preview",
    target: storedTarget
  });
  if (!stringInput(input, "target")) {
    binding.ok = false;
    binding.diagnostics = [
      diagnostic("missing_target", "Execute requires the reviewed preview target."),
      ...binding.diagnostics.filter((item) => item.code !== "missing_target")
    ];
  }
  if (!binding.ok) return blockedImplementedExecuteResult(tool, storedTarget, binding.diagnostics, context, binding);
  if (!lookup.ok || !lookup.record) {
    return blockedImplementedExecuteResult(tool, storedTarget, [lookup.diagnostic ?? diagnostic("stored_preview_missing", "Stored preview was not found; execute binding fails closed.")], context, binding);
  }
  if (lookup.record.tool !== "product.update.preview") {
    return blockedImplementedExecuteResult(tool, storedTarget, [diagnostic("stored_preview_tool_mismatch", "Stored preview is not a product update preview.")], context, binding);
  }

  const extracted = productUpdateInputFromStoredPreview(lookup.record);
  const variantPriceExtracted = productVariantPriceUpdateInputFromStoredPreview(lookup.record);
  const variantCreateExtracted = productVariantCreateInputFromStoredPreview(lookup.record);
  const optionCreateExtracted = productOptionsCreateInputFromStoredPreview(lookup.record);
  const optionDeleteExtracted = productOptionsDeleteInputFromStoredPreview(lookup.record);
  const optionReorderExtracted = productOptionsReorderInputFromStoredPreview(lookup.record);
  const optionRenameExtracted = productOptionRenameInputFromStoredPreview(lookup.record);
  const optionValueRenameExtracted = productOptionValueRenameInputFromStoredPreview(lookup.record);
  const optionValueAddExtracted = productOptionValueAddInputFromStoredPreview(lookup.record);
  const optionValueDeleteExtracted = productOptionValueDeleteInputFromStoredPreview(lookup.record);
  const extractedShapeCount = [extracted, variantPriceExtracted, variantCreateExtracted, optionCreateExtracted, optionDeleteExtracted, optionReorderExtracted, optionRenameExtracted, optionValueRenameExtracted, optionValueAddExtracted, optionValueDeleteExtracted].filter((item) => item.ok).length;
  if (extractedShapeCount > 1) {
    return blockedImplementedExecuteResult(tool, storedTarget, [diagnostic("mixed_product_update_fields", "Stored product update preview mixes multiple product update shapes; create separate previews to avoid partial writes.")], context, binding);
  }
  if (extractedShapeCount === 0) {
    const diagnostics: ExecutePreviewBindingDiagnostic[] = [];
    if (!optionRenameExtracted.ok && hasDiagnostic(optionRenameExtracted.diagnostics, "multiple_option_renames")) diagnostics.push(...optionRenameExtracted.diagnostics);
    if (!optionValueRenameExtracted.ok && hasDiagnostic(optionValueRenameExtracted.diagnostics, "multiple_option_value_renames")) diagnostics.push(...optionValueRenameExtracted.diagnostics);
    if (!optionValueAddExtracted.ok && hasDiagnostic(optionValueAddExtracted.diagnostics, "multiple_option_value_adds")) diagnostics.push(...optionValueAddExtracted.diagnostics);
    if (!optionValueDeleteExtracted.ok && hasDiagnostic(optionValueDeleteExtracted.diagnostics, "multiple_option_value_deletes")) diagnostics.push(...optionValueDeleteExtracted.diagnostics);
    if (!extracted.ok) diagnostics.push(...extracted.diagnostics);
    if (!variantPriceExtracted.ok && diagnostics.length === 0) diagnostics.push(...variantPriceExtracted.diagnostics);
    if (!variantCreateExtracted.ok && diagnostics.length === 0) diagnostics.push(...variantCreateExtracted.diagnostics);
    if (!optionCreateExtracted.ok && diagnostics.length === 0) diagnostics.push(...optionCreateExtracted.diagnostics);
    if (!optionDeleteExtracted.ok && diagnostics.length === 0) diagnostics.push(...optionDeleteExtracted.diagnostics);
    if (!optionReorderExtracted.ok && diagnostics.length === 0) diagnostics.push(...optionReorderExtracted.diagnostics);
    if (!optionRenameExtracted.ok && diagnostics.length === 0) diagnostics.push(...optionRenameExtracted.diagnostics);
    if (!optionValueRenameExtracted.ok && diagnostics.length === 0) diagnostics.push(...optionValueRenameExtracted.diagnostics);
    if (!optionValueAddExtracted.ok && diagnostics.length === 0) diagnostics.push(...optionValueAddExtracted.diagnostics);
    if (!optionValueDeleteExtracted.ok && diagnostics.length === 0) diagnostics.push(...optionValueDeleteExtracted.diagnostics);
    return blockedImplementedExecuteResult(tool, storedTarget, diagnostics, context, binding);
  }

  const preflight = checkWriteScopePreflight(context.config, tool);
  if (!preflight.ok) return blockedImplementedExecuteResult(tool, storedTarget, preflight.diagnostics, context, binding);

  if (variantPriceExtracted.ok) {
    const write = await updateProductVariantPrices(context.config, variantPriceExtracted.input, { fetcher: context.fetcher });
    return productVariantPriceUpdateWriteResult(tool, storedTarget, binding, write, context);
  }

  if (variantCreateExtracted.ok) {
    const write = await createProductVariants(context.config, variantCreateExtracted.input, { fetcher: context.fetcher });
    return productVariantCreateWriteResult(tool, storedTarget, binding, write, context);
  }

  if (optionCreateExtracted.ok) {
    const write = await createProductOptions(context.config, optionCreateExtracted.input, { fetcher: context.fetcher });
    return productOptionCreateWriteResult(tool, storedTarget, binding, write, context);
  }

  if (optionDeleteExtracted.ok) {
    const write = await deleteProductOptions(context.config, optionDeleteExtracted.input, { fetcher: context.fetcher });
    return productOptionDeleteWriteResult(tool, storedTarget, binding, write, context);
  }

  if (optionReorderExtracted.ok) {
    const write = await reorderProductOptions(context.config, optionReorderExtracted.input, { fetcher: context.fetcher });
    return productOptionReorderWriteResult(tool, storedTarget, binding, write, context);
  }

  if (optionRenameExtracted.ok) {
    const write = await renameProductOption(context.config, optionRenameExtracted.input, { fetcher: context.fetcher });
    return productOptionRenameWriteResult(tool, storedTarget, binding, write, context);
  }

  if (optionValueRenameExtracted.ok) {
    const write = await renameProductOptionValue(context.config, optionValueRenameExtracted.input, { fetcher: context.fetcher });
    return productOptionValueRenameWriteResult(tool, storedTarget, binding, write, context);
  }

  if (optionValueAddExtracted.ok) {
    const write = await addProductOptionValues(context.config, optionValueAddExtracted.input, { fetcher: context.fetcher });
    return productOptionValueAddWriteResult(tool, storedTarget, binding, write, context);
  }

  if (optionValueDeleteExtracted.ok) {
    const write = await deleteProductOptionValues(context.config, optionValueDeleteExtracted.input, { fetcher: context.fetcher });
    return productOptionValueDeleteWriteResult(tool, storedTarget, binding, write, context);
  }

  if (!extracted.ok) return blockedImplementedExecuteResult(tool, storedTarget, extracted.diagnostics, context, binding);
  const write = await updateProduct(context.config, extracted.input, { fetcher: context.fetcher });
  return productUpdateWriteResult(tool, storedTarget, binding, write, context);
}

async function collectionCreateExecuteResult(input: Record<string, unknown>, context: ToolContext): Promise<Record<string, unknown>> {
  const tool = "collection.create.execute";
  const target = collectionExecuteTarget(input, context);

  if (context.config.readOnly) {
    return blockedImplementedExecuteResult(tool, target, [diagnostic("read_only", "Execute is blocked because read-only mode is enabled.")], context, "collection.create.preview");
  }

  if (!context.previewStore) {
    return blockedImplementedExecuteResult(tool, target, [diagnostic("stored_preview_missing", "Stored preview was not found; execute binding fails closed.")], context, "collection.create.preview");
  }

  const lookup = context.previewStore.getPreview(stringInput(input, "previewId"));
  const storedTarget = lookup.record ? previewRecordBindingTarget(lookup.record) : target;
  const binding = verifyStoredPreviewBinding(context.previewStore, input, {
    executeTool: tool,
    expectedPreviewTool: "collection.create.preview",
    target: storedTarget
  });
  if (!stringInput(input, "target")) {
    binding.ok = false;
    binding.diagnostics = [
      diagnostic("missing_target", "Execute requires the reviewed preview target."),
      ...binding.diagnostics.filter((item) => item.code !== "missing_target")
    ];
  }
  if (!binding.ok) return blockedImplementedExecuteResult(tool, storedTarget, binding.diagnostics, context, binding);
  if (!lookup.ok || !lookup.record) {
    return blockedImplementedExecuteResult(tool, storedTarget, [lookup.diagnostic ?? diagnostic("stored_preview_missing", "Stored preview was not found; execute binding fails closed.")], context, binding);
  }
  if (lookup.record.tool !== "collection.create.preview") {
    return blockedImplementedExecuteResult(tool, storedTarget, [diagnostic("stored_preview_tool_mismatch", "Stored preview is not a collection creation preview.")], context, binding);
  }

  const extracted = collectionCreateInputFromStoredPreview(lookup.record);
  if (!extracted.ok) return blockedImplementedExecuteResult(tool, storedTarget, extracted.diagnostics, context, binding);

  const preflight = checkWriteScopePreflight(context.config, tool);
  if (!preflight.ok) return blockedImplementedExecuteResult(tool, storedTarget, preflight.diagnostics, context, binding);

  const write = await createCollection(context.config, extracted.input, { fetcher: context.fetcher });
  return collectionCreateWriteResult(tool, storedTarget, binding, write, context);
}

async function inventorySetQuantityExecuteResult(input: Record<string, unknown>, context: ToolContext): Promise<Record<string, unknown>> {
  const tool = "inventory.setQuantity.execute";
  const target = inventoryExecuteTarget(input, context);

  if (context.config.readOnly) {
    return blockedImplementedExecuteResult(tool, target, [diagnostic("read_only", "Execute is blocked because read-only mode is enabled.")], context, "inventory.setQuantity.preview");
  }

  if (!context.previewStore) {
    return blockedImplementedExecuteResult(tool, target, [diagnostic("stored_preview_missing", "Stored preview was not found; execute binding fails closed.")], context, "inventory.setQuantity.preview");
  }

  const lookup = context.previewStore.getPreview(stringInput(input, "previewId"));
  const storedTarget = lookup.record ? previewRecordBindingTarget(lookup.record) : target;
  const binding = verifyStoredPreviewBinding(context.previewStore, input, {
    executeTool: tool,
    expectedPreviewTool: "inventory.setQuantity.preview",
    target: storedTarget
  });
  if (!stringInput(input, "target")) {
    binding.ok = false;
    binding.diagnostics = [
      diagnostic("missing_target", "Execute requires the reviewed preview target."),
      ...binding.diagnostics.filter((item) => item.code !== "missing_target")
    ];
  }
  if (!binding.ok) return blockedImplementedExecuteResult(tool, storedTarget, binding.diagnostics, context, binding);
  if (!lookup.ok || !lookup.record) {
    return blockedImplementedExecuteResult(tool, storedTarget, [lookup.diagnostic ?? diagnostic("stored_preview_missing", "Stored preview was not found; execute binding fails closed.")], context, binding);
  }
  if (lookup.record.tool !== "inventory.setQuantity.preview") {
    return blockedImplementedExecuteResult(tool, storedTarget, [diagnostic("stored_preview_tool_mismatch", "Stored preview is not an inventory quantity preview.")], context, binding);
  }

  const extracted = inventorySetQuantityInputFromStoredPreview(lookup.record);
  if (!extracted.ok) return blockedImplementedExecuteResult(tool, storedTarget, extracted.diagnostics, context, binding);

  const preflight = checkWriteScopePreflight(context.config, tool);
  if (!preflight.ok) return blockedImplementedExecuteResult(tool, storedTarget, preflight.diagnostics, context, binding);

  const write = await setInventoryQuantity(context.config, extracted.input, { fetcher: context.fetcher });
  return inventorySetQuantityWriteResult(tool, storedTarget, binding, write, context);
}

function savePreviewRecord(context: ToolContext, record: Parameters<MemoryPreviewStore["savePreview"]>[0]): StoredPreviewRecord {
  return ensurePreviewStore(context).savePreview(record);
}

function ensurePreviewStore(context: ToolContext): MemoryPreviewStore {
  context.previewStore ??= new MemoryPreviewStore();
  return context.previewStore;
}

function previewBindingOutput(record: StoredPreviewRecord): Record<string, unknown> {
  return {
    previewId: record.previewId,
    expectedTool: record.tool,
    target: previewRecordBindingTarget(record),
    previewHash: record.previewHash,
    expiresAt: record.expiresAt
  };
}

function prepareExecuteBinding(
  tool: string,
  target: string,
  input: Record<string, unknown>,
  context: ToolContext
): { target: string; binding?: ExecutePreviewBindingResult } {
  const expectedTool = expectedPreviewTool(tool);
  if (!context.previewStore || !stringInput(input, "previewId")) return { target };

  const binding = verifyStoredPreviewBinding(context.previewStore, input, {
    executeTool: tool,
    expectedPreviewTool: expectedTool,
    target
  });
  return { target, binding };
}

function blockedExecuteResult(
  tool: string,
  target: string,
  binding: ExecutePreviewBindingResult,
  context: ToolContext
): Record<string, unknown> {
  const summary = "Execute blocked because preview binding preconditions were not met.";
  const audit = context.audit.record({
    tool,
    target,
    mode: "execute",
    summary,
    result: "blocked"
  });
  return {
    ok: false,
    mode: "execute",
    implemented: false,
    status: "blocked",
    summary,
    audit,
    diagnostics: binding.diagnostics,
    previewBinding: {
      previewId: binding.previewId,
      expectedTool: binding.expectedPreviewTool,
      target: binding.target
    },
    placeholder: true
  };
}

function blockedImplementedExecuteResult(
  tool: string,
  target: string,
  diagnostics: ExecutePreviewBindingDiagnostic[],
  context: ToolContext,
  bindingOrExpectedTool?: ExecutePreviewBindingResult | string
): Record<string, unknown> {
  const safeTarget = safeExecuteString(target);
  const binding = typeof bindingOrExpectedTool === "string" ? undefined : bindingOrExpectedTool;
  const expectedTool = typeof bindingOrExpectedTool === "string" ? bindingOrExpectedTool : binding?.expectedPreviewTool ?? expectedPreviewTool(tool);
  const summary = "Execute blocked because write preconditions were not met.";
  const audit = context.audit.record({
    tool,
    target: safeTarget,
    mode: "execute",
    summary,
    result: "blocked"
  });
  return {
    ok: false,
    mode: "execute",
    implemented: true,
    status: "blocked",
    summary,
    audit,
    diagnostics,
    previewBinding: {
      previewId: binding?.previewId ? safeExecuteString(binding.previewId) : undefined,
      expectedTool,
      target: binding?.target ? safeExecuteString(binding.target) : safeTarget
    }
  };
}

function pageCreateWriteResult(
  tool: string,
  target: string,
  binding: ExecutePreviewBindingResult,
  write: PageCreateResult,
  context: ToolContext
): Record<string, unknown> {
  const result = pageCreateAuditResult(write);
  const audit = context.audit.record({
    tool,
    target: safeExecuteString(target),
    mode: "execute",
    summary: write.summary,
    result
  });
  return {
    ok: write.ok,
    mode: "execute",
    implemented: true,
    status: write.status,
    summary: write.summary,
    audit,
    createdPage: write.page,
    verification: write.verification,
    userErrors: write.userErrors,
    diagnostics: write.diagnostics,
    previewBinding: {
      previewId: binding.previewId,
      expectedTool: binding.expectedPreviewTool,
      target: binding.target
    }
  };
}

function pageCreateAuditResult(write: PageCreateResult): "success" | "blocked" | "failed" {
  if (write.status === "ok") return "success";
  if (write.status === "blocked" || write.status === "missing_input" || write.status === "user_errors") return "blocked";
  return "failed";
}

function productCreateWriteResult(
  tool: string,
  target: string,
  binding: ExecutePreviewBindingResult,
  write: ProductCreateResult,
  context: ToolContext
): Record<string, unknown> {
  const result = productCreateAuditResult(write);
  const audit = context.audit.record({
    tool,
    target: safeExecuteString(target),
    mode: "execute",
    summary: write.summary,
    result
  });
  return {
    ok: write.ok,
    mode: "execute",
    implemented: true,
    status: write.status,
    summary: write.summary,
    audit,
    createdProduct: write.product,
    userErrors: write.userErrors,
    diagnostics: write.diagnostics,
    previewBinding: {
      previewId: binding.previewId,
      expectedTool: binding.expectedPreviewTool,
      target: binding.target
    }
  };
}

function productUpdateWriteResult(
  tool: string,
  target: string,
  binding: ExecutePreviewBindingResult,
  write: ProductUpdateResult,
  context: ToolContext
): Record<string, unknown> {
  const result = productUpdateAuditResult(write);
  const audit = context.audit.record({
    tool,
    target: safeExecuteString(target),
    mode: "execute",
    summary: write.summary,
    result
  });
  return {
    ok: write.ok,
    mode: "execute",
    implemented: true,
    status: write.status,
    summary: write.summary,
    audit,
    updatedProduct: write.product,
    userErrors: write.userErrors,
    diagnostics: write.diagnostics,
    previewBinding: {
      previewId: binding.previewId,
      expectedTool: binding.expectedPreviewTool,
      target: binding.target
    }
  };
}

function productVariantPriceUpdateWriteResult(
  tool: string,
  target: string,
  binding: ExecutePreviewBindingResult,
  write: ProductVariantPriceUpdateResult,
  context: ToolContext
): Record<string, unknown> {
  const result = productUpdateAuditResult(write);
  const audit = context.audit.record({
    tool,
    target: safeExecuteString(target),
    mode: "execute",
    summary: write.summary,
    result
  });
  return {
    ok: write.ok,
    mode: "execute",
    implemented: true,
    status: write.status,
    summary: write.summary,
    audit,
    updatedVariantPrices: write.variantPriceUpdate,
    userErrors: write.userErrors,
    diagnostics: write.diagnostics,
    previewBinding: {
      previewId: binding.previewId,
      expectedTool: binding.expectedPreviewTool,
      target: binding.target
    }
  };
}

function productVariantCreateWriteResult(
  tool: string,
  target: string,
  binding: ExecutePreviewBindingResult,
  write: ProductVariantBulkCreateResult,
  context: ToolContext
): Record<string, unknown> {
  const result = productUpdateAuditResult(write);
  const audit = context.audit.record({
    tool,
    target: safeExecuteString(target),
    mode: "execute",
    summary: write.summary,
    result
  });
  return {
    ok: write.ok,
    mode: "execute",
    implemented: true,
    status: write.status,
    summary: write.summary,
    audit,
    createdVariants: write.variantCreate,
    userErrors: write.userErrors,
    diagnostics: write.diagnostics,
    previewBinding: {
      previewId: binding.previewId,
      expectedTool: binding.expectedPreviewTool,
      target: binding.target
    }
  };
}

function productOptionCreateWriteResult(
  tool: string,
  target: string,
  binding: ExecutePreviewBindingResult,
  write: ProductOptionsCreateResult,
  context: ToolContext
): Record<string, unknown> {
  const result = productUpdateAuditResult(write);
  const audit = context.audit.record({
    tool,
    target: safeExecuteString(target),
    mode: "execute",
    summary: write.summary,
    result
  });
  return {
    ok: write.ok,
    mode: "execute",
    implemented: true,
    status: write.status,
    summary: write.summary,
    audit,
    createdOptions: write.optionCreate,
    userErrors: write.userErrors,
    diagnostics: write.diagnostics,
    previewBinding: {
      previewId: binding.previewId,
      expectedTool: binding.expectedPreviewTool,
      target: binding.target
    }
  };
}

function productOptionDeleteWriteResult(
  tool: string,
  target: string,
  binding: ExecutePreviewBindingResult,
  write: ProductOptionsDeleteResult,
  context: ToolContext
): Record<string, unknown> {
  const result = productUpdateAuditResult(write);
  const audit = context.audit.record({
    tool,
    target: safeExecuteString(target),
    mode: "execute",
    summary: write.summary,
    result
  });
  return {
    ok: write.ok,
    mode: "execute",
    implemented: true,
    status: write.status,
    summary: write.summary,
    audit,
    deletedOptions: write.optionDelete,
    userErrors: write.userErrors,
    diagnostics: write.diagnostics,
    previewBinding: {
      previewId: binding.previewId,
      expectedTool: binding.expectedPreviewTool,
      target: binding.target
    }
  };
}

function productOptionReorderWriteResult(
  tool: string,
  target: string,
  binding: ExecutePreviewBindingResult,
  write: ProductOptionsReorderResult,
  context: ToolContext
): Record<string, unknown> {
  const result = productUpdateAuditResult(write);
  const audit = context.audit.record({
    tool,
    target: safeExecuteString(target),
    mode: "execute",
    summary: write.summary,
    result
  });
  return {
    ok: write.ok,
    mode: "execute",
    implemented: true,
    status: write.status,
    summary: write.summary,
    audit,
    reorderedOptions: write.optionReorder,
    userErrors: write.userErrors,
    diagnostics: write.diagnostics,
    previewBinding: {
      previewId: binding.previewId,
      expectedTool: binding.expectedPreviewTool,
      target: binding.target
    }
  };
}

function productOptionRenameWriteResult(
  tool: string,
  target: string,
  binding: ExecutePreviewBindingResult,
  write: ProductOptionRenameResult,
  context: ToolContext
): Record<string, unknown> {
  const result = productUpdateAuditResult(write);
  const audit = context.audit.record({
    tool,
    target: safeExecuteString(target),
    mode: "execute",
    summary: write.summary,
    result
  });
  return {
    ok: write.ok,
    mode: "execute",
    implemented: true,
    status: write.status,
    summary: write.summary,
    audit,
    renamedOption: write.optionRename,
    userErrors: write.userErrors,
    diagnostics: write.diagnostics,
    previewBinding: {
      previewId: binding.previewId,
      expectedTool: binding.expectedPreviewTool,
      target: binding.target
    }
  };
}

function productOptionValueRenameWriteResult(
  tool: string,
  target: string,
  binding: ExecutePreviewBindingResult,
  write: ProductOptionValueRenameResult,
  context: ToolContext
): Record<string, unknown> {
  const result = productUpdateAuditResult(write);
  const audit = context.audit.record({
    tool,
    target: safeExecuteString(target),
    mode: "execute",
    summary: write.summary,
    result
  });
  return {
    ok: write.ok,
    mode: "execute",
    implemented: true,
    status: write.status,
    summary: write.summary,
    audit,
    renamedOptionValue: write.optionValueRename,
    userErrors: write.userErrors,
    diagnostics: write.diagnostics,
    previewBinding: {
      previewId: binding.previewId,
      expectedTool: binding.expectedPreviewTool,
      target: binding.target
    }
  };
}

function productOptionValueAddWriteResult(
  tool: string,
  target: string,
  binding: ExecutePreviewBindingResult,
  write: ProductOptionValueAddResult,
  context: ToolContext
): Record<string, unknown> {
  const result = productUpdateAuditResult(write);
  const audit = context.audit.record({
    tool,
    target: safeExecuteString(target),
    mode: "execute",
    summary: write.summary,
    result
  });
  return {
    ok: write.ok,
    mode: "execute",
    implemented: true,
    status: write.status,
    summary: write.summary,
    audit,
    addedOptionValues: write.optionValueAdd,
    userErrors: write.userErrors,
    diagnostics: write.diagnostics,
    previewBinding: {
      previewId: binding.previewId,
      expectedTool: binding.expectedPreviewTool,
      target: binding.target
    }
  };
}

function productOptionValueDeleteWriteResult(
  tool: string,
  target: string,
  binding: ExecutePreviewBindingResult,
  write: ProductOptionValueDeleteResult,
  context: ToolContext
): Record<string, unknown> {
  const result = productUpdateAuditResult(write);
  const audit = context.audit.record({
    tool,
    target: safeExecuteString(target),
    mode: "execute",
    summary: write.summary,
    result
  });
  return {
    ok: write.ok,
    mode: "execute",
    implemented: true,
    status: write.status,
    summary: write.summary,
    audit,
    deletedOptionValues: write.optionValueDelete,
    userErrors: write.userErrors,
    diagnostics: write.diagnostics,
    previewBinding: {
      previewId: binding.previewId,
      expectedTool: binding.expectedPreviewTool,
      target: binding.target
    }
  };
}

function collectionCreateWriteResult(
  tool: string,
  target: string,
  binding: ExecutePreviewBindingResult,
  write: CollectionCreateResult,
  context: ToolContext
): Record<string, unknown> {
  const result = collectionCreateAuditResult(write);
  const audit = context.audit.record({
    tool,
    target: safeExecuteString(target),
    mode: "execute",
    summary: write.summary,
    result
  });
  return {
    ok: write.ok,
    mode: "execute",
    implemented: true,
    status: write.status,
    summary: write.summary,
    audit,
    createdCollection: write.collection,
    userErrors: write.userErrors,
    diagnostics: write.diagnostics,
    previewBinding: {
      previewId: binding.previewId,
      expectedTool: binding.expectedPreviewTool,
      target: binding.target
    }
  };
}

function inventorySetQuantityWriteResult(
  tool: string,
  target: string,
  binding: ExecutePreviewBindingResult,
  write: InventorySetQuantityResult,
  context: ToolContext
): Record<string, unknown> {
  const result = inventoryWriteAuditResult(write);
  const audit = context.audit.record({
    tool,
    target: safeExecuteString(target),
    mode: "execute",
    summary: write.summary,
    result
  });
  return {
    ok: write.ok,
    mode: "execute",
    implemented: true,
    status: write.status,
    summary: write.summary,
    audit,
    inventorySet: write.inventorySet,
    userErrors: write.userErrors,
    diagnostics: write.diagnostics,
    previewBinding: {
      previewId: binding.previewId,
      expectedTool: binding.expectedPreviewTool,
      target: binding.target
    }
  };
}

function productCreateAuditResult(write: ProductCreateResult): "success" | "blocked" | "failed" {
  if (write.status === "ok") return "success";
  if (write.status === "blocked" || write.status === "missing_input" || write.status === "user_errors") return "blocked";
  return "failed";
}

function productUpdateAuditResult(write: ProductUpdateResult | ProductVariantPriceUpdateResult | ProductVariantBulkCreateResult | ProductOptionsCreateResult | ProductOptionsDeleteResult | ProductOptionsReorderResult | ProductOptionRenameResult | ProductOptionValueRenameResult | ProductOptionValueAddResult | ProductOptionValueDeleteResult): "success" | "blocked" | "failed" {
  if (write.status === "ok") return "success";
  if (write.status === "blocked" || write.status === "missing_input" || write.status === "user_errors") return "blocked";
  return "failed";
}

function collectionCreateAuditResult(write: CollectionCreateResult): "success" | "blocked" | "failed" {
  if (write.status === "ok") return "success";
  if (write.status === "blocked" || write.status === "missing_input" || write.status === "user_errors") return "blocked";
  return "failed";
}

function inventoryWriteAuditResult(write: InventorySetQuantityResult): "success" | "blocked" | "failed" {
  if (write.status === "ok") return "success";
  if (write.status === "blocked" || write.status === "missing_input" || write.status === "user_errors") return "blocked";
  return "failed";
}

function pageCreateInputFromStoredPreview(record: StoredPreviewRecord): { ok: true; input: PageCreateInput } | { ok: false; diagnostics: ExecutePreviewBindingDiagnostic[] } {
  const title = safeContentText(changeValue(record, "title") ?? targetField(record, "title"), 255);
  const body = safeContentText(changeValue(record, "body") ?? changeValue(record, "content") ?? changeValue(record, "bodyHtml"), 5000);
  const handle = safeContentText(changeValue(record, "handle") ?? targetField(record, "handle"), 180);
  const templateSuffix = safeContentText(changeValue(record, "templateSuffix"), 180);
  const isPublished = publishPreference(changeValue(record, "publishPreference")) ?? false;

  if (!title) {
    return {
      ok: false,
      diagnostics: [diagnostic("missing_page_title", "Stored page preview did not include a safe title for execution.")]
    };
  }

  return {
    ok: true,
    input: {
      title,
      body,
      handle,
      templateSuffix,
      isPublished
    }
  };
}

function productCreateInputFromStoredPreview(record: StoredPreviewRecord): { ok: true; input: ProductCreateInput } | { ok: false; diagnostics: ExecutePreviewBindingDiagnostic[] } {
  const title = safeContentText(changeValue(record, "title") ?? targetField(record, "title"), 255);
  const descriptionHtml = safeContentText(changeValue(record, "description") ?? changeValue(record, "bodyHtml") ?? changeValue(record, "body"), 5000);
  const vendor = safeContentText(changeValue(record, "vendor"), 255);
  const productType = safeContentText(changeValue(record, "productType"), 255);
  const status = productStatus(changeValue(record, "status"));
  const tags = tagValues(changeValue(record, "tags"));

  if (!title) {
    return {
      ok: false,
      diagnostics: [diagnostic("missing_product_title", "Stored product preview did not include a safe title for execution.")]
    };
  }

  return {
    ok: true,
    input: {
      title,
      descriptionHtml,
      vendor,
      productType,
      status,
      tags
    }
  };
}

function productUpdateInputFromStoredPreview(record: StoredPreviewRecord): { ok: true; input: ProductUpdateInput } | { ok: false; diagnostics: ExecutePreviewBindingDiagnostic[] } {
  const id = safeContentText(targetField(record, "id") ?? targetField(record, "productId") ?? changeAfterValue(record, "id") ?? changeAfterValue(record, "productId"), 180);
  if (!id) {
    return {
      ok: false,
      diagnostics: [diagnostic("missing_product_update_id", "Stored product update preview did not include a safe product ID; handle-only execute is blocked.")]
    };
  }

  const input: ProductUpdateInput = { id };
  const title = safeContentText(changeAfterValue(record, "title"), 255);
  if (title) input.title = title;
  const descriptionHtml = safeContentText(changeAfterValue(record, "descriptionHtml") ?? changeAfterValue(record, "description"), 5000);
  if (descriptionHtml) input.descriptionHtml = descriptionHtml;
  const vendor = safeContentText(changeAfterValue(record, "vendor"), 255);
  if (vendor) input.vendor = vendor;
  const productType = safeContentText(changeAfterValue(record, "productType"), 255);
  if (productType) input.productType = productType;
  const status = productStatus(changeAfterValue(record, "status"));
  if (status) input.status = status;
  const tags = tagValues(changeAfterValue(record, "tags"));
  if (tags) input.tags = tags;

  if (Object.keys(input).length === 1) {
    return {
      ok: false,
      diagnostics: [diagnostic("missing_product_update_fields", "Stored product update preview did not include supported basic product fields for execution.")]
    };
  }

  return { ok: true, input };
}

function productVariantPriceUpdateInputFromStoredPreview(record: StoredPreviewRecord): { ok: true; input: ProductVariantPriceUpdateInput } | { ok: false; diagnostics: ExecutePreviewBindingDiagnostic[] } {
  const productId = safeContentText(targetField(record, "id") ?? targetField(record, "productId") ?? changeAfterValue(record, "id") ?? changeAfterValue(record, "productId"), 180);
  const variants = variantPriceUpdatesFromStoredPreview(record);

  if (!productId || variants.length === 0) {
    return {
      ok: false,
      diagnostics: [diagnostic("missing_product_update_fields", "Stored product update preview did not include supported basic product fields or explicit variant price fields for execution.")]
    };
  }

  return {
    ok: true,
    input: {
      productId,
      variants
    }
  };
}

function productVariantCreateInputFromStoredPreview(record: StoredPreviewRecord): { ok: true; input: ProductVariantBulkCreateInput } | { ok: false; diagnostics: ExecutePreviewBindingDiagnostic[] } {
  const productId = safeContentText(targetField(record, "id") ?? targetField(record, "productId") ?? changeAfterValue(record, "id") ?? changeAfterValue(record, "productId"), 180);
  const variants = variantCreatesFromStoredPreview(record);

  if (!productId || variants.length === 0) {
    return {
      ok: false,
      diagnostics: [diagnostic("missing_product_update_fields", "Stored product update preview did not include supported basic product fields, explicit variant price fields, or explicit variant create option values for execution.")]
    };
  }

  return {
    ok: true,
    input: {
      productId,
      variants
    }
  };
}

function productOptionsCreateInputFromStoredPreview(record: StoredPreviewRecord): { ok: true; input: ProductOptionsCreateInput } | { ok: false; diagnostics: ExecutePreviewBindingDiagnostic[] } {
  const productId = safeContentText(targetField(record, "id") ?? targetField(record, "productId") ?? changeAfterValue(record, "id") ?? changeAfterValue(record, "productId"), 180);
  const options = optionCreatesFromStoredPreview(record);

  if (!productId || options.length === 0) {
    return {
      ok: false,
      diagnostics: [diagnostic("missing_product_update_fields", "Stored product update preview did not include supported basic product fields, explicit variant fields, or explicit option create fields for execution.")]
    };
  }

  return {
    ok: true,
    input: {
      productId,
      options
    }
  };
}

function productOptionsDeleteInputFromStoredPreview(record: StoredPreviewRecord): { ok: true; input: ProductOptionsDeleteInput } | { ok: false; diagnostics: ExecutePreviewBindingDiagnostic[] } {
  const productId = safeContentText(targetField(record, "id") ?? targetField(record, "productId") ?? changeAfterValue(record, "id") ?? changeAfterValue(record, "productId"), 180);
  const optionIds = optionDeletesFromStoredPreview(record);

  if (!productId || optionIds.length === 0) {
    return {
      ok: false,
      diagnostics: [diagnostic("missing_product_update_fields", "Stored product update preview did not include supported basic product fields, explicit variant fields, explicit option create fields, or explicit option delete fields for execution.")]
    };
  }

  return {
    ok: true,
    input: {
      productId,
      optionIds
    }
  };
}

function productOptionsReorderInputFromStoredPreview(record: StoredPreviewRecord): { ok: true; input: ProductOptionsReorderInput } | { ok: false; diagnostics: ExecutePreviewBindingDiagnostic[] } {
  const productId = safeContentText(targetField(record, "id") ?? targetField(record, "productId") ?? changeAfterValue(record, "id") ?? changeAfterValue(record, "productId"), 180);
  const options = optionReordersFromStoredPreview(record);

  if (!productId || options.length < 2) {
    return {
      ok: false,
      diagnostics: [diagnostic("missing_product_update_fields", "Stored product update preview did not include supported basic product fields, explicit variant fields, explicit option create fields, explicit option delete fields, or explicit option reorder fields for execution.")]
    };
  }

  return {
    ok: true,
    input: {
      productId,
      options
    }
  };
}

function productOptionValueAddInputFromStoredPreview(record: StoredPreviewRecord): { ok: true; input: ProductOptionValueAddInput } | { ok: false; diagnostics: ExecutePreviewBindingDiagnostic[] } {
  const productId = safeContentText(targetField(record, "id") ?? targetField(record, "productId") ?? changeAfterValue(record, "id") ?? changeAfterValue(record, "productId"), 180);
  const optionValueAdds = optionValueAddsFromStoredPreview(record);

  if (!productId || optionValueAdds.length === 0) {
    return {
      ok: false,
      diagnostics: [diagnostic("missing_product_update_fields", "Stored product update preview did not include supported basic product fields, explicit variant fields, explicit option create fields, explicit option rename fields, explicit option value rename fields, or explicit option value add fields for execution.")]
    };
  }

  if (optionValueAdds.length > 1) {
    return {
      ok: false,
      diagnostics: [diagnostic("multiple_option_value_adds", "Stored product update preview includes option value adds for multiple options; create separate previews to avoid partial writes.")]
    };
  }

  return {
    ok: true,
    input: {
      productId,
      optionId: optionValueAdds[0].optionId,
      values: optionValueAdds[0].values
    }
  };
}

function productOptionValueDeleteInputFromStoredPreview(record: StoredPreviewRecord): { ok: true; input: ProductOptionValueDeleteInput } | { ok: false; diagnostics: ExecutePreviewBindingDiagnostic[] } {
  const productId = safeContentText(targetField(record, "id") ?? targetField(record, "productId") ?? changeAfterValue(record, "id") ?? changeAfterValue(record, "productId"), 180);
  const optionValueDeletes = optionValueDeletesFromStoredPreview(record);

  if (!productId || optionValueDeletes.length === 0) {
    return {
      ok: false,
      diagnostics: [diagnostic("missing_product_update_fields", "Stored product update preview did not include supported basic product fields, explicit variant fields, explicit option create fields, explicit option rename fields, explicit option value rename fields, explicit option value add fields, or explicit option value delete fields for execution.")]
    };
  }

  if (optionValueDeletes.length > 1) {
    return {
      ok: false,
      diagnostics: [diagnostic("multiple_option_value_deletes", "Stored product update preview includes option value deletes for multiple options; create separate previews to avoid partial writes.")]
    };
  }

  return {
    ok: true,
    input: {
      productId,
      optionId: optionValueDeletes[0].optionId,
      valueIds: optionValueDeletes[0].valueIds
    }
  };
}

function productOptionRenameInputFromStoredPreview(record: StoredPreviewRecord): { ok: true; input: ProductOptionRenameInput } | { ok: false; diagnostics: ExecutePreviewBindingDiagnostic[] } {
  const productId = safeContentText(targetField(record, "id") ?? targetField(record, "productId") ?? changeAfterValue(record, "id") ?? changeAfterValue(record, "productId"), 180);
  const options = optionRenamesFromStoredPreview(record);

  if (!productId || options.length === 0) {
    return {
      ok: false,
      diagnostics: [diagnostic("missing_product_update_fields", "Stored product update preview did not include supported basic product fields, explicit variant fields, explicit option create fields, or explicit option rename fields for execution.")]
    };
  }

  if (options.length > 1) {
    return {
      ok: false,
      diagnostics: [diagnostic("multiple_option_renames", "Stored product update preview includes multiple option renames; create separate previews to avoid partial writes.")]
    };
  }

  return {
    ok: true,
    input: {
      productId,
      option: options[0]
    }
  };
}

function productOptionValueRenameInputFromStoredPreview(record: StoredPreviewRecord): { ok: true; input: ProductOptionValueRenameInput } | { ok: false; diagnostics: ExecutePreviewBindingDiagnostic[] } {
  const productId = safeContentText(targetField(record, "id") ?? targetField(record, "productId") ?? changeAfterValue(record, "id") ?? changeAfterValue(record, "productId"), 180);
  const optionValueRenames = optionValueRenamesFromStoredPreview(record);

  if (!productId || optionValueRenames.length === 0) {
    return {
      ok: false,
      diagnostics: [diagnostic("missing_product_update_fields", "Stored product update preview did not include supported basic product fields, explicit variant fields, explicit option create fields, explicit option rename fields, or explicit option value rename fields for execution.")]
    };
  }

  if (optionValueRenames.length > 1) {
    return {
      ok: false,
      diagnostics: [diagnostic("multiple_option_value_renames", "Stored product update preview includes multiple option value renames; create separate previews to avoid partial writes.")]
    };
  }

  return {
    ok: true,
    input: {
      productId,
      optionId: optionValueRenames[0].optionId,
      value: optionValueRenames[0].value
    }
  };
}

function variantPriceUpdatesFromStoredPreview(record: StoredPreviewRecord): Array<{ id: string; price: string }> {
  const result: Array<{ id: string; price: string }> = [];
  const seen = new Set<string>();
  const add = (idValue: unknown, priceValue: unknown) => {
    const id = safeContentText(idValue, 180);
    const price = safePriceText(priceValue);
    if (!id || price === undefined || seen.has(id)) return;
    seen.add(id);
    result.push({ id, price });
  };

  for (const item of storedChangeArray(record, "variants", "after")) {
    const fields = objectFields(item);
    add(fields.id ?? fields.variantId, fields.price);
  }
  for (const item of storedChangeArray(record, "variantPrices", "after")) {
    const fields = objectFields(item);
    add(fields.id ?? fields.variantId, fields.price);
  }
  add(changeAfterValue(record, "variantId"), changeAfterValue(record, "price"));

  return result.slice(0, 25);
}

function variantCreatesFromStoredPreview(record: StoredPreviewRecord): ProductVariantBulkCreateInput["variants"] {
  const result: ProductVariantBulkCreateInput["variants"] = [];
  for (const item of storedChangeArray(record, "variants", "after")) {
    const fields = objectFields(item);
    if (safeContentText(fields.id ?? fields.variantId, 180)) continue;
    const optionValues = variantOptionValuesFromStoredValue(fields.optionValues ?? fields.options ?? fields.selectedOptions);
    if (optionValues.length === 0) continue;
    const variant: ProductVariantBulkCreateInput["variants"][number] = { optionValues };
    const price = safePriceText(fields.price);
    if (price !== undefined) variant.price = price;
    const sku = safeVariantText(fields.sku, 120);
    if (sku) variant.sku = sku;
    result.push(variant);
    if (result.length >= 25) break;
  }
  return result;
}

function storedChangeArray(record: StoredPreviewRecord, field: string, side: "value" | "after"): unknown[] {
  for (const item of arrayItems(record.proposedChanges)) {
    const change = objectFields(item);
    if (stringFromUnknown(change.field) !== field) continue;
    return arraySummaryItems(side === "after" ? change.after : change.value);
  }
  return [];
}

function variantOptionValuesFromStoredValue(value: unknown): ProductVariantBulkCreateInput["variants"][number]["optionValues"] {
  const result: ProductVariantBulkCreateInput["variants"][number]["optionValues"] = [];
  const seen = new Set<string>();
  const fieldMap = objectFields(value);
  for (const [fieldKey, fieldValue] of Object.entries(fieldMap)) {
    const optionName = safeVariantText(fieldKey, 120);
    const name = safeVariantText(fieldValue, 180);
    if (!optionName || !name) continue;
    const key = `${optionName}\u0000${name}`;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push({ optionName, name });
    if (result.length >= 3) break;
  }
  if (result.length > 0) return result;

  for (const item of arraySummaryItems(value)) {
    const pair = variantOptionValuePairFromString(item);
    if (pair) {
      const key = `${pair.optionName}\u0000${pair.name}`;
      if (!seen.has(key)) {
        seen.add(key);
        result.push(pair);
      }
      if (result.length >= 3) break;
      continue;
    }

    const fields = objectFields(item);
    const explicitOptionName = safeVariantText(fields.optionName, 120);
    const optionName = explicitOptionName ?? safeVariantText(fields.name ?? fields.option, 120);
    const name = explicitOptionName
      ? safeVariantText(fields.name ?? fields.value ?? fields.optionValue ?? fields.optionValueName, 180)
      : safeVariantText(fields.value ?? fields.optionValue ?? fields.optionValueName, 180);
    if (!optionName || !name) continue;
    const key = `${optionName}\u0000${name}`;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push({ optionName, name });
    if (result.length >= 3) break;
  }
  return result;
}

function variantOptionValuePairFromString(value: unknown): ProductVariantBulkCreateInput["variants"][number]["optionValues"][number] | undefined {
  if (typeof value !== "string") return undefined;
  const separatorIndex = value.indexOf("=");
  if (separatorIndex <= 0) return undefined;
  const optionName = safeVariantText(value.slice(0, separatorIndex), 120);
  const name = safeVariantText(value.slice(separatorIndex + 1), 180);
  return optionName && name ? { optionName, name } : undefined;
}

function safeVariantText(value: unknown, maxLength: number): string | undefined {
  const text = safeContentText(value, maxLength);
  return text && text !== "[redacted]" ? text : undefined;
}

function optionCreatesFromStoredPreview(record: StoredPreviewRecord): ProductOptionsCreateInput["options"] {
  const result: ProductOptionsCreateInput["options"] = [];
  const seen = new Set<string>();
  for (const item of storedChangeArray(record, "options", "after")) {
    const fields = objectFields(item);
    if (hasOptionReorderMarker(fields)) continue;
    if (safeVariantText(fields.id ?? fields.optionId, 180)) continue;
    const name = safeVariantText(fields.name ?? fields.optionName, 120);
    const values = optionValueNamesFromStoredValue(fields.values ?? fields.optionValues);
    if (!name || values.length === 0 || seen.has(name)) continue;
    seen.add(name);
    result.push({ name, values });
    if (result.length >= 3) break;
  }
  return result;
}

function optionDeletesFromStoredPreview(record: StoredPreviewRecord): ProductOptionsDeleteInput["optionIds"] {
  const result: ProductOptionsDeleteInput["optionIds"] = [];
  const seen = new Set<string>();
  const add = (value: unknown) => {
    const id = safeVariantText(value, 180);
    if (!id || seen.has(id)) return;
    seen.add(id);
    result.push(id);
  };

  for (const item of arraySummaryItems(changeAfterValue(record, "deleteOptionIds"))) add(item);
  for (const item of arraySummaryItems(changeAfterValue(record, "deletedOptionIds"))) add(item);
  for (const item of arraySummaryItems(changeAfterValue(record, "optionsToDelete"))) add(item);
  for (const item of arraySummaryItems(changeAfterValue(record, "productOptionsToDelete"))) add(item);

  for (const item of storedChangeArray(record, "options", "after")) {
    const fields = objectFields(item);
    const markedForDelete = fields.delete === true || fields.remove === true || fields.destroy === true || fields.deleteOption === true;
    if (!markedForDelete) continue;
    add(fields.id ?? fields.optionId);
  }

  return result.slice(0, 3);
}

function optionReordersFromStoredPreview(record: StoredPreviewRecord): ProductOptionsReorderInput["options"] {
  const result: ProductOptionsReorderInput["options"] = [];
  const seen = new Set<string>();
  const add = (value: unknown) => {
    const fields = objectFields(value);
    const directText = safeVariantText(value, 180);
    const id = safeVariantText(fields.id ?? fields.optionId ?? (directText?.startsWith("gid://shopify/ProductOption/") ? directText : undefined), 180);
    const name = safeVariantText(fields.name ?? fields.optionName ?? (!directText?.startsWith("gid://shopify/ProductOption/") ? directText : undefined), 120);
    if (!id && !name) return;
    const key = id ? `id:${id}` : `name:${name}`;
    if (seen.has(key)) return;
    seen.add(key);
    const option: ProductOptionsReorderInput["options"][number] = {};
    if (id) option.id = id;
    else if (name) option.name = name;
    const values = optionReorderValuesFromStoredValue(fields.values ?? fields.optionValues ?? fields.valueOrder ?? fields.optionValueOrder);
    if (values.length > 0) option.values = values;
    result.push(option);
  };

  for (const field of ["optionOrder", "optionsOrder", "reorderOptions", "productOptionsOrder"]) {
    for (const item of arraySummaryItems(changeAfterValue(record, field))) add(item);
  }

  if (result.length === 0) {
    const markedOptions = storedChangeArray(record, "options", "after").filter((item) => hasOptionReorderMarker(objectFields(item)));
    for (const item of markedOptions) add(item);
  }

  return result.slice(0, 3);
}

function optionReorderValuesFromStoredValue(value: unknown): NonNullable<ProductOptionsReorderInput["options"][number]["values"]> {
  const result: NonNullable<ProductOptionsReorderInput["options"][number]["values"]> = [];
  const seen = new Set<string>();
  for (const item of arraySummaryItems(value)) {
    const fields = objectFields(item);
    const rawDirectText = safeVariantText(item, 180);
    const separatorIndex = rawDirectText?.indexOf("=") ?? -1;
    const directText = separatorIndex > 0 ? rawDirectText?.slice(0, separatorIndex) : rawDirectText;
    const id = safeVariantText(fields.id ?? fields.optionValueId ?? (directText?.startsWith("gid://shopify/ProductOptionValue/") ? directText : undefined), 180);
    const name = safeVariantText(fields.name ?? fields.value ?? (!directText?.startsWith("gid://shopify/ProductOptionValue/") ? directText : undefined), 120);
    if (!id && !name) continue;
    const key = id ? `id:${id}` : `name:${name}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const optionValue: NonNullable<ProductOptionsReorderInput["options"][number]["values"]>[number] = {};
    if (id) optionValue.id = id;
    else if (name) optionValue.name = name;
    result.push(optionValue);
    if (result.length >= 25) break;
  }
  return result;
}

function hasOptionReorderMarker(fields: Record<string, unknown>): boolean {
  return fields.reorder === true || fields.reorderOption === true || fields.position !== undefined || fields.newPosition !== undefined || fields.order !== undefined;
}

function optionValueAddsFromStoredPreview(record: StoredPreviewRecord): Array<{ optionId: string; values: ProductOptionValueAddInput["values"] }> {
  const result: Array<{ optionId: string; values: ProductOptionValueAddInput["values"] }> = [];
  for (const item of storedChangeArray(record, "options", "after")) {
    const fields = objectFields(item);
    if (hasOptionReorderMarker(fields)) continue;
    const optionId = safeVariantText(fields.id ?? fields.optionId, 180);
    if (!optionId) continue;
    const values = optionValueAddNamesFromStoredValue(fields.values ?? fields.optionValues).map((name) => ({ name }));
    if (values.length === 0) continue;
    result.push({ optionId, values });
    if (result.length > 1) return result;
  }
  return result;
}

function optionValueDeletesFromStoredPreview(record: StoredPreviewRecord): Array<{ optionId: string; valueIds: string[] }> {
  const result: Array<{ optionId: string; valueIds: string[] }> = [];
  for (const item of storedChangeArray(record, "options", "after")) {
    const fields = objectFields(item);
    if (hasOptionReorderMarker(fields)) continue;
    const optionId = safeVariantText(fields.id ?? fields.optionId, 180);
    if (!optionId) continue;
    const valueIds = optionValueDeleteIdsFromStoredValue(fields.deleteValueIds ?? fields.deletedValueIds ?? fields.valuesToDelete ?? fields.optionValuesToDelete ?? fields.deleteValues);
    if (valueIds.length === 0) continue;
    result.push({ optionId, valueIds });
    if (result.length > 1) return result;
  }
  return result;
}

function optionRenamesFromStoredPreview(record: StoredPreviewRecord): Array<ProductOptionRenameInput["option"]> {
  const result: Array<ProductOptionRenameInput["option"]> = [];
  const seen = new Set<string>();
  for (const item of storedChangeArray(record, "options", "after")) {
    const fields = objectFields(item);
    if (hasOptionReorderMarker(fields)) continue;
    if (arraySummaryItems(fields.values ?? fields.optionValues).length > 0) continue;
    const id = safeVariantText(fields.id ?? fields.optionId, 180);
    const name = safeVariantText(fields.name ?? fields.optionName, 120);
    if (!id || !name || seen.has(id)) continue;
    seen.add(id);
    result.push({ id, name });
    if (result.length > 1) break;
  }
  return result;
}

function optionValueRenamesFromStoredPreview(record: StoredPreviewRecord): Array<{ optionId: string; value: ProductOptionValueRenameInput["value"] }> {
  const result: Array<{ optionId: string; value: ProductOptionValueRenameInput["value"] }> = [];
  const seen = new Set<string>();
  for (const item of storedChangeArray(record, "options", "after")) {
    const fields = objectFields(item);
    if (hasOptionReorderMarker(fields)) continue;
    const optionId = safeVariantText(fields.id ?? fields.optionId, 180);
    if (!optionId) continue;
    for (const valueItem of arraySummaryItems(fields.values ?? fields.optionValues)) {
      const pair = optionValueRenamePairFromString(valueItem);
      if (pair) {
        if (seen.has(pair.id)) continue;
        seen.add(pair.id);
        result.push({ optionId, value: pair });
        if (result.length > 1) return result;
        continue;
      }
      const valueFields = objectFields(valueItem);
      const id = safeVariantText(valueFields.id ?? valueFields.optionValueId, 180);
      const name = safeVariantText(valueFields.name ?? valueFields.value ?? valueItem, 120);
      if (!id || !name || seen.has(id)) continue;
      seen.add(id);
      result.push({ optionId, value: { id, name } });
      if (result.length > 1) return result;
    }
  }
  return result;
}

function optionValueRenamePairFromString(value: unknown): ProductOptionValueRenameInput["value"] | undefined {
  if (typeof value !== "string") return undefined;
  const separatorIndex = value.indexOf("=");
  if (separatorIndex <= 0) return undefined;
  const id = safeVariantText(value.slice(0, separatorIndex), 180);
  const name = safeVariantText(value.slice(separatorIndex + 1), 120);
  if (!id?.startsWith("gid://shopify/ProductOptionValue/")) return undefined;
  return id && name ? { id, name } : undefined;
}

function optionValueAddNamesFromStoredValue(value: unknown): string[] {
  const result: string[] = [];
  const seen = new Set<string>();
  for (const item of arraySummaryItems(value)) {
    if (optionValueRenamePairFromString(item)) continue;
    const fields = objectFields(item);
    if (safeVariantText(fields.id ?? fields.optionValueId, 180)) continue;
    const name = safeVariantText(fields.name ?? fields.value ?? item, 120);
    if (!name || seen.has(name)) continue;
    seen.add(name);
    result.push(name);
    if (result.length >= 25) break;
  }
  return result;
}

function optionValueDeleteIdsFromStoredValue(value: unknown): string[] {
  const result: string[] = [];
  const seen = new Set<string>();
  for (const item of arraySummaryItems(value)) {
    const fields = objectFields(item);
    const id = safeVariantText(fields.id ?? fields.optionValueId ?? item, 180);
    if (!id || seen.has(id)) continue;
    seen.add(id);
    result.push(id);
    if (result.length >= 25) break;
  }
  return result;
}

function optionValueNamesFromStoredValue(value: unknown): string[] {
  const result: string[] = [];
  const seen = new Set<string>();
  for (const item of arraySummaryItems(value)) {
    const fields = objectFields(item);
    const name = safeVariantText(fields.name ?? fields.value ?? item, 120);
    if (!name || seen.has(name)) continue;
    seen.add(name);
    result.push(name);
    if (result.length >= 25) break;
  }
  return result;
}

function collectionCreateInputFromStoredPreview(record: StoredPreviewRecord): { ok: true; input: CollectionCreateInput } | { ok: false; diagnostics: ExecutePreviewBindingDiagnostic[] } {
  const title = safeContentText(changeValue(record, "title") ?? targetField(record, "title"), 255);
  const handle = safeContentText(changeValue(record, "handle") ?? targetField(record, "handle"), 180);
  const productIds = arraySummaryItems(changeValue(record, "productIds"))
    .map((item) => safeContentText(item, 180))
    .filter((item): item is string => Boolean(item));
  const rules = arraySummaryItems(changeValue(record, "rules"));

  if (!title) {
    return {
      ok: false,
      diagnostics: [diagnostic("missing_collection_title", "Stored collection preview did not include a safe title for execution.")]
    };
  }
  if (rules.length > 0) {
    return {
      ok: false,
      diagnostics: [diagnostic("unsupported_collection_rules", "collection.create.execute does not implement rule-based or smart collection creation yet.")]
    };
  }
  if (productIds.length === 0) {
    return {
      ok: false,
      diagnostics: [diagnostic("missing_collection_products", "Stored collection preview did not include explicit product IDs supported by collection.create.execute.")]
    };
  }

  return {
    ok: true,
    input: {
      title,
      handle,
      productIds
    }
  };
}

function inventorySetQuantityInputFromStoredPreview(record: StoredPreviewRecord): { ok: true; input: InventorySetQuantityInput } | { ok: false; diagnostics: ExecutePreviewBindingDiagnostic[] } {
  const inventoryItemId = safeContentText(targetField(record, "id") ?? changeValue(record, "inventoryItemId"), 180);
  const locationId = safeContentText(changeValue(record, "locationId"), 180);
  const quantity = safeInteger(changeAfterValue(record, "quantity"));
  const compareQuantityValue = changeValue(record, "compareQuantity");
  const compareQuantity = compareQuantityValue === null ? null : safeInteger(compareQuantityValue);
  const ignoreCompareQuantity = changeValue(record, "ignoreCompareQuantity") === true;
  const reason = safeContentText(changeValue(record, "reason"), 120);
  const referenceDocumentUri = safeContentText(changeValue(record, "referenceDocumentUri"), 255);

  if (!inventoryItemId) {
    return {
      ok: false,
      diagnostics: [diagnostic("missing_inventory_item_id", "Stored inventory preview did not include a safe inventory item ID.")]
    };
  }
  if (!locationId) {
    return {
      ok: false,
      diagnostics: [diagnostic("missing_inventory_location_id", "Stored inventory preview did not include a safe location ID.")]
    };
  }
  if (quantity === undefined || quantity < 0) {
    return {
      ok: false,
      diagnostics: [diagnostic("missing_inventory_quantity", "Stored inventory preview did not include a safe non-negative quantity.")]
    };
  }
  if (!reason) {
    return {
      ok: false,
      diagnostics: [diagnostic("missing_inventory_reason", "Stored inventory preview did not include a safe inventory adjustment reason.")]
    };
  }
  if (!ignoreCompareQuantity && compareQuantity === undefined) {
    return {
      ok: false,
      diagnostics: [diagnostic("missing_inventory_compare_quantity", "Stored inventory preview did not include compareQuantity or explicit ignoreCompareQuantity.")]
    };
  }

  return {
    ok: true,
    input: {
      inventoryItemId,
      locationId,
      quantity,
      compareQuantity,
      ignoreCompareQuantity,
      reason,
      referenceDocumentUri,
      idempotencyKey: `store-agent:${record.previewId}`
    }
  };
}

function changeValue(record: StoredPreviewRecord, field: string): unknown {
  for (const item of arrayItems(record.proposedChanges)) {
    const change = objectFields(item);
    if (stringFromUnknown(change.field) === field) return unwrapStoredValue(change.value);
  }
  return undefined;
}

function changeAfterValue(record: StoredPreviewRecord, field: string): unknown {
  for (const item of arrayItems(record.proposedChanges)) {
    const change = objectFields(item);
    if (stringFromUnknown(change.field) === field) return unwrapStoredValue(change.after);
  }
  return undefined;
}

function targetField(record: StoredPreviewRecord, field: string): unknown {
  const target = objectFields(record.target);
  return unwrapStoredValue(target[field]);
}

function arrayItems(value: unknown): unknown[] {
  if (Array.isArray(value)) return value;
  if (!value || typeof value !== "object") return [];
  const record = value as { items?: unknown };
  return Array.isArray(record.items) ? record.items : [];
}

function objectFields(value: unknown): Record<string, unknown> {
  const unwrapped = unwrapStoredValue(value);
  if (unwrapped && typeof unwrapped === "object" && !Array.isArray(unwrapped)) return unwrapped as Record<string, unknown>;
  return {};
}

function arraySummaryItems(value: unknown): unknown[] {
  const unwrapped = unwrapStoredValue(value);
  if (Array.isArray(unwrapped)) return unwrapped;
  if (!unwrapped || typeof unwrapped !== "object") return [];
  const items = (unwrapped as { items?: unknown }).items;
  if (Array.isArray(items)) return items;
  if (items && typeof items === "object") {
    const nested = (items as { items?: unknown }).items;
    if (Array.isArray(nested)) return nested;
  }
  return [];
}

function unwrapStoredValue(value: unknown): unknown {
  if (value && typeof value === "object" && !Array.isArray(value) && "fields" in value) {
    const fields = (value as { fields?: unknown }).fields;
    if (fields && typeof fields === "object" && !Array.isArray(fields)) return fields;
  }
  return value;
}

function safeContentText(value: unknown, maxLength: number): string | undefined {
  const unwrapped = unwrapStoredValue(value);
  const text = stringFromUnknown(unwrapped) ?? stringFromUnknown(objectFields(unwrapped).excerpt);
  if (!text) return undefined;
  if (looksLikeSecret(text)) return "[redacted]";
  const normalized = text.trim();
  return normalized.length > maxLength ? `${normalized.slice(0, maxLength)}...` : normalized;
}

function publishPreference(value: unknown): boolean | undefined {
  const unwrapped = unwrapStoredValue(value);
  if (typeof unwrapped === "boolean") return unwrapped;
  const text = stringFromUnknown(unwrapped)?.toLowerCase();
  if (!text) return undefined;
  if (["true", "publish", "published", "active", "online"].includes(text)) return true;
  if (["false", "draft", "unpublished", "hidden"].includes(text)) return false;
  return undefined;
}

function productStatus(value: unknown): string | undefined {
  const text = safeContentText(value, 80)?.toUpperCase();
  return text && ["ACTIVE", "DRAFT", "ARCHIVED"].includes(text) ? text : undefined;
}

function tagValues(value: unknown): string[] | undefined {
  const tags = arraySummaryItems(value)
    .map((item) => safeContentText(item, 80))
    .filter((item): item is string => Boolean(item))
    .slice(0, 20);
  return tags.length > 0 ? tags : undefined;
}

function safePriceText(value: unknown): string | undefined {
  const unwrapped = unwrapStoredValue(value);
  if (typeof unwrapped === "number" && Number.isFinite(unwrapped) && unwrapped >= 0) return unwrapped.toFixed(2);
  const text = stringFromUnknown(unwrapped);
  if (!text || looksLikeSecret(text)) return undefined;
  return /^\d+(\.\d{1,2})?$/.test(text) ? text : undefined;
}

function safeInteger(value: unknown): number | undefined {
  const unwrapped = unwrapStoredValue(value);
  return typeof unwrapped === "number" && Number.isInteger(unwrapped) ? unwrapped : undefined;
}

function pageExecuteTarget(input: Record<string, unknown>, context: ToolContext): string {
  const previewId = stringInput(input, "previewId");
  const lookup = previewId && context.previewStore ? context.previewStore.getPreview(previewId) : undefined;
  if (lookup?.record) return previewRecordBindingTarget(lookup.record);
  return safeExecuteString(stringInput(input, "target") || stringInput(input, "title", "page"));
}

function productExecuteTarget(input: Record<string, unknown>, context: ToolContext): string {
  const previewId = stringInput(input, "previewId");
  const lookup = previewId && context.previewStore ? context.previewStore.getPreview(previewId) : undefined;
  if (lookup?.record) return previewRecordBindingTarget(lookup.record);
  return safeExecuteString(stringInput(input, "target") || stringInput(input, "title", "product"));
}

function collectionExecuteTarget(input: Record<string, unknown>, context: ToolContext): string {
  const previewId = stringInput(input, "previewId");
  const lookup = previewId && context.previewStore ? context.previewStore.getPreview(previewId) : undefined;
  if (lookup?.record) return previewRecordBindingTarget(lookup.record);
  return safeExecuteString(stringInput(input, "target") || stringInput(input, "title", "collection"));
}

function inventoryExecuteTarget(input: Record<string, unknown>, context: ToolContext): string {
  const previewId = stringInput(input, "previewId");
  const lookup = previewId && context.previewStore ? context.previewStore.getPreview(previewId) : undefined;
  if (lookup?.record) return previewRecordBindingTarget(lookup.record);
  return safeExecuteString(stringInput(input, "target") || stringInput(input, "inventoryItemId", "inventory"));
}

function stringFromUnknown(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function diagnostic(code: string, message: string): ExecutePreviewBindingDiagnostic {
  return { code, message };
}

function hasDiagnostic(diagnostics: ExecutePreviewBindingDiagnostic[], code: string): boolean {
  return diagnostics.some((item) => item.code === code);
}

function expectedPreviewTool(tool: string): string {
  if (tool === "theme.apply") return "theme.preview";
  return tool.replace(/\.execute$/, ".preview");
}

function safeExecuteString(value: string): string {
  if (looksLikeSecret(value)) return "[redacted]";
  if (isHttpUrl(value)) return sanitizeUrl(value);
  const normalized = value.trim();
  return normalized.length > 180 ? `${normalized.slice(0, 180)}...` : normalized;
}

function sanitizeUrl(value: string): string {
  try {
    const url = new URL(value.trim());
    url.username = "";
    url.password = "";
    for (const [key, paramValue] of url.searchParams.entries()) {
      if (isSensitiveQueryKey(key) || looksLikeSecret(paramValue)) url.searchParams.set(key, "[redacted]");
    }
    const result = url.toString();
    return result.length > 180 ? `${result.slice(0, 180)}...` : result;
  } catch {
    return safeExecuteString(value);
  }
}

function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

function isSensitiveQueryKey(key: string): boolean {
  return /token|secret|password|authorization|access[_-]?token|accessToken|api[_-]?key|client[_-]?secret|key/i.test(key);
}

function looksLikeSecret(value: string): boolean {
  return /shpat_[A-Za-z0-9_]+|shpua_[A-Za-z0-9_]+|ghp_[A-Za-z0-9_]+|Bearer\s+[A-Za-z0-9._-]+/i.test(value);
}

export async function createDefaultContext(): Promise<ToolContext> {
  const configPath = process.env.SHOPIFY_STORE_AGENT_CONFIG;
  const stored = await loadStoredConfig(configPath);
  const config = stored ?? createConfig({
    storeUrl: process.env.SHOPIFY_STORE_AGENT_STORE ?? "example.myshopify.com",
    adminAccessToken: process.env.SHOPIFY_STORE_AGENT_ADMIN_TOKEN,
    themeAccessToken: process.env.SHOPIFY_STORE_AGENT_THEME_TOKEN,
    readOnly: process.env.SHOPIFY_STORE_AGENT_READ_ONLY !== "false",
    capabilities: emptyCapabilities()
  });
  return {
    config,
    audit: new FileAuditLog({ path: auditLogPath(configPath, config) }),
    previewStore: new FilePreviewStore({ path: previewStorePath(configPath) })
  };
}

function auditLogPath(configPath: string | undefined, config: StoreAgentConfig): string {
  if (process.env.SHOPIFY_STORE_AGENT_AUDIT_LOG) return process.env.SHOPIFY_STORE_AGENT_AUDIT_LOG;
  if (config.auditLogPath) return config.auditLogPath;
  if (configPath) return join(dirname(configPath), "audit.jsonl");
  return defaultAuditLogPath();
}

function previewStorePath(configPath: string | undefined): string {
  if (process.env.SHOPIFY_STORE_AGENT_PREVIEW_STORE) return process.env.SHOPIFY_STORE_AGENT_PREVIEW_STORE;
  if (configPath) return join(dirname(configPath), "previews.json");
  return defaultPreviewStorePath();
}

export const tools: ToolDefinition[] = [
  {
    name: "shopify.capabilities.check",
    description: "Check local Shopify Store Agent config and known capability flags.",
    inputSchema: { type: "object" },
    handler: async (input, context) => {
      const live = booleanInput(input, "live");
      const result = await checkShopifyCapabilities(context.config, {
        live,
        fetcher: context.fetcher
      });
      const audit = context.audit.record({
        tool: "shopify.capabilities.check",
        target: context.config.storeUrl,
        mode: "read",
        summary: live ? "Live-safe Shopify capability diagnostics generated." : "Local Shopify capability diagnostics generated.",
        result: "success"
      });
      return {
        ok: result.ok,
        mode: "read",
        audit,
        diagnostics: result
      };
    }
  },
  {
    name: "product.create.preview",
    description: "Preview creating a Shopify product from user-provided data. Does not search for products autonomously.",
    inputSchema: { type: "object" },
    handler: (input, context) => catalogPreviewResult(previewProductCreate(input), context)
  },
  {
    name: "product.create.execute",
    description: "Create a Shopify product only after stored preview binding and explicit confirmation.",
    inputSchema: { type: "object" },
    handler: (input, context) => productCreateExecuteResult(input, context)
  },
  {
    name: "product.update.preview",
    description: "Preview user-provided product updates for an explicit product ID or handle.",
    inputSchema: { type: "object" },
    handler: (input, context) => productUpdatePreviewResult(input, context)
  },
  {
    name: "product.update.execute",
    description: "Update basic Shopify product fields, explicit variant prices, explicit variants, explicit options, explicit option deletes, explicit option order, explicit option names, explicit option value names, explicit option value additions, or explicit option value deletions after stored product update preview binding and explicit confirmation.",
    inputSchema: { type: "object" },
    handler: (input, context) => productUpdateExecuteResult(input, context)
  },
  {
    name: "product.media.update.preview",
    description: "Preview product media changes from user-provided media inputs.",
    inputSchema: { type: "object" },
    handler: (input, context) => catalogPreviewResult(previewProductMediaUpdate(input), context)
  },
  {
    name: "product.media.update.execute",
    description: "Placeholder for product media updates after preview and confirmation.",
    inputSchema: { type: "object" },
    handler: (input, context) => executePlaceholder("product.media.update.execute", stringInput(input, "productId", "product"), "Product media update execution placeholder.", input, context)
  },
  {
    name: "product.importFromUserUrl.preview",
    description: "Preview importing product data from a user-provided Shopify URL without private-source access.",
    inputSchema: { type: "object" },
    handler: (input, context) => catalogPreviewResult(previewProductImportFromUserUrl(input), context)
  },
  {
    name: "product.importFromUserUrl.execute",
    description: "Placeholder for creating/updating a product from a reviewed user-provided URL import preview.",
    inputSchema: { type: "object" },
    handler: (input, context) => executePlaceholder("product.importFromUserUrl.execute", stringInput(input, "url", "product-url"), "Product import-from-URL execution placeholder.", input, context)
  },
  {
    name: "product.get",
    description: "Read minimal product metadata by explicit product ID or handle.",
    inputSchema: { type: "object" },
    handler: (input, context) => shopifyReadResult(
      "product.get",
      stringInput(input, "productId") || stringInput(input, "id") || stringInput(input, "handle", "product"),
      "Product get request completed.",
      context,
      getProduct(context.config, {
        id: stringInput(input, "id") || undefined,
        productId: stringInput(input, "productId") || undefined,
        handle: stringInput(input, "handle") || undefined
      }, { fetcher: context.fetcher })
    )
  },
  {
    name: "inventory.lookup",
    description: "Read inventory item, variant, location, and quantity IDs from an explicit inventory item ID, variant ID, or SKU.",
    inputSchema: { type: "object" },
    handler: (input, context) => shopifyReadResult(
      "inventory.lookup",
      stringInput(input, "inventoryItemId") || stringInput(input, "variantId") || stringInput(input, "sku", "inventory"),
      "Inventory lookup request completed.",
      context,
      lookupInventory(context.config, {
        inventoryItemId: stringInput(input, "inventoryItemId") || undefined,
        variantId: stringInput(input, "variantId") || undefined,
        sku: stringInput(input, "sku") || undefined,
        first: typeof input.first === "number" ? input.first : undefined,
        levelsFirst: typeof input.levelsFirst === "number" ? input.levelsFirst : undefined
      }, { fetcher: context.fetcher })
    )
  },
  {
    name: "inventory.setQuantity.preview",
    description: "Preview setting an explicit inventory item quantity at an explicit location.",
    inputSchema: { type: "object" },
    handler: (input, context) => catalogPreviewResult(previewInventorySetQuantity(input), context)
  },
  {
    name: "inventory.setQuantity.execute",
    description: "Set one Shopify inventory item quantity only after stored preview binding and explicit confirmation.",
    inputSchema: { type: "object" },
    handler: (input, context) => inventorySetQuantityExecuteResult(input, context)
  },
  {
    name: "order.find",
    description: "Find order candidates by explicit order number, customer email, or order ID.",
    inputSchema: { type: "object" },
    handler: (input, context) => shopifyReadResult(
      "order.find",
      stringInput(input, "id") || stringInput(input, "orderNumber") || stringInput(input, "email") || stringInput(input, "query", "order"),
      "Order find request completed.",
      context,
      findOrders(context.config, {
        id: stringInput(input, "id") || undefined,
        orderNumber: stringInput(input, "orderNumber") || undefined,
        email: stringInput(input, "email") || undefined,
        query: stringInput(input, "query") || undefined
      }, { fetcher: context.fetcher })
    )
  },
  {
    name: "order.get",
    description: "Get an order by explicit Shopify order ID.",
    inputSchema: { type: "object" },
    handler: (input, context) => shopifyReadResult(
      "order.get",
      stringInput(input, "orderId") || stringInput(input, "id", "order"),
      "Order get request completed.",
      context,
      getOrder(context.config, {
        id: stringInput(input, "id") || undefined,
        orderId: stringInput(input, "orderId") || undefined
      }, { fetcher: context.fetcher })
    )
  },
  {
    name: "customer.find",
    description: "Find customer candidates by user-provided email, name, phone, or Shopify ID.",
    inputSchema: { type: "object" },
    handler: (input, context) => shopifyReadResult(
      "customer.find",
      stringInput(input, "id") || stringInput(input, "email") || stringInput(input, "query", "customer"),
      "Customer find request completed.",
      context,
      findCustomers(context.config, {
        id: stringInput(input, "id") || undefined,
        email: stringInput(input, "email") || undefined,
        query: stringInput(input, "query") || undefined
      }, { fetcher: context.fetcher })
    )
  },
  {
    name: "customer.updateAddress.preview",
    description: "Preview updating a customer address from explicit user-provided address data.",
    inputSchema: { type: "object" },
    handler: (input, context) => previewResult("customer.updateAddress.preview", stringInput(input, "customerId", "customer"), "Customer address update preview generated.", context)
  },
  {
    name: "customer.updateAddress.execute",
    description: "Placeholder for customer address update after preview and confirmation.",
    inputSchema: { type: "object" },
    handler: (input, context) => executePlaceholder("customer.updateAddress.execute", stringInput(input, "customerId", "customer"), "Customer address update execution placeholder.", input, context)
  },
  {
    name: "refund.preview",
    description: "Create a full or partial refund preview with an idempotency key.",
    inputSchema: { type: "object" },
    handler: (input) => createRefundPreview({
      orderId: stringInput(input, "orderId", "unknown-order"),
      shippingAmount: typeof input.shippingAmount === "string" ? input.shippingAmount : undefined,
      reason: typeof input.reason === "string" ? input.reason : undefined
    })
  },
  {
    name: "refund.execute",
    description: "Placeholder for executing a refund only after preview and explicit confirmation.",
    inputSchema: { type: "object" },
    handler: (input, context) => ({
      ...executePlaceholder("refund.execute", stringInput(input, "orderId", "refund"), "Refund execution placeholder.", input, context),
      idempotencyKey: safeExecuteString(stringInput(input, "idempotencyKey"))
    })
  },
  {
    name: "tracking.get",
    description: "Get tracking details by explicit order, fulfillment, or tracking input.",
    inputSchema: { type: "object" },
    handler: (input, context) => shopifyReadResult(
      "tracking.get",
      stringInput(input, "orderId") || stringInput(input, "fulfillmentId") || stringInput(input, "trackingNumber") || stringInput(input, "query", "tracking"),
      "Tracking get request completed.",
      context,
      getTracking(context.config, {
        orderId: stringInput(input, "orderId") || undefined,
        fulfillmentId: stringInput(input, "fulfillmentId") || undefined,
        trackingNumber: stringInput(input, "trackingNumber") || undefined,
        query: stringInput(input, "query") || undefined
      }, { fetcher: context.fetcher })
    )
  },
  {
    name: "tracking.update.preview",
    description: "Preview fulfillment tracking number, company, and URL changes.",
    inputSchema: { type: "object" },
    handler: (input, context) => previewResult("tracking.update.preview", stringInput(input, "fulfillmentId", "fulfillment"), "Tracking update preview generated.", context)
  },
  {
    name: "tracking.update.execute",
    description: "Placeholder for tracking update after preview and confirmation.",
    inputSchema: { type: "object" },
    handler: (input, context) => executePlaceholder("tracking.update.execute", stringInput(input, "fulfillmentId", "fulfillment"), "Tracking update execution placeholder.", input, context)
  },
  {
    name: "page.create.preview",
    description: "Preview creation of a Shopify page from user-provided title and body.",
    inputSchema: { type: "object" },
    handler: (input, context) => catalogPreviewResult(previewPageCreate(input), context)
  },
  {
    name: "page.create.execute",
    description: "Create a Shopify page only after stored preview binding and explicit confirmation.",
    inputSchema: { type: "object" },
    handler: (input, context) => pageCreateExecuteResult(input, context)
  },
  {
    name: "collection.create.preview",
    description: "Preview collection creation from explicit user criteria or product IDs.",
    inputSchema: { type: "object" },
    handler: (input, context) => catalogPreviewResult(previewCollectionCreate(input), context)
  },
  {
    name: "collection.create.execute",
    description: "Create a minimal custom collection only after stored preview binding and confirmation.",
    inputSchema: { type: "object" },
    handler: (input, context) => collectionCreateExecuteResult(input, context)
  },
  {
    name: "bulk.preview",
    description: "Create a bulk edit preview from explicit changes supplied by the user.",
    inputSchema: { type: "object" },
    handler: (input) => {
      const changes = Array.isArray(input.changes) ? input.changes : [];
      return createBulkPreview(changes.map((change, index) => ({
        id: typeof change === "object" && change && "id" in change ? String(change.id) : `change-${index + 1}`,
        before: typeof change === "object" && change && "before" in change ? change.before : null,
        after: typeof change === "object" && change && "after" in change ? change.after : null
      })));
    }
  },
  {
    name: "bulk.execute",
    description: "Placeholder for executing a reviewed bulk edit after explicit confirmation.",
    inputSchema: { type: "object" },
    handler: (input, context) => executePlaceholder("bulk.execute", stringInput(input, "previewId", "bulk"), "Bulk execution placeholder.", input, context)
  },
  {
    name: "bulk.status",
    description: "Get placeholder status for a bulk operation or audit ID.",
    inputSchema: { type: "object" },
    handler: (input, context) => readResult("bulk.status", stringInput(input, "bulkOperationId", "bulk"), "Bulk status request prepared.", context)
  },
  {
    name: "theme.reference.analyze",
    description: "Analyze a user-provided Shopify reference URL using rendered page signals, not private Liquid code.",
    inputSchema: { type: "object" },
    handler: (input, context) => previewResult("theme.reference.analyze", stringInput(input, "url", "reference"), "Reference URL analysis plan generated.", context)
  },
  {
    name: "theme.section.generate",
    description: "Generate an original section plan inspired by a user-provided reference URL.",
    inputSchema: { type: "object" },
    handler: (input, context) => planThemeSection({
      name: stringInput(input, "name", "AI Section"),
      referenceUrl: stringInput(input, "referenceUrl") || undefined,
      capabilities: context.config.capabilities
    })
  },
  {
    name: "theme.preview",
    description: "Prepare a preview-first theme section change.",
    inputSchema: { type: "object" },
    handler: (input, context) => previewResult("theme.preview", stringInput(input, "sectionName", "section"), "Theme preview prepared.", context)
  },
  {
    name: "theme.apply",
    description: "Apply a theme change only after preview ID and explicit confirmation.",
    inputSchema: { type: "object" },
    handler: (input, context) => {
      const previewId = stringInput(input, "previewId") || undefined;
      const result = executePlaceholder("theme.apply", previewId ?? "theme", "Theme apply execution placeholder.", input, context);
      return { ...result, previewId: previewId ? safeExecuteString(previewId) : previewId };
    }
  },
  {
    name: "theme.rollback",
    description: "Prepare rollback from an audit snapshot.",
    inputSchema: { type: "object" },
    handler: (input, context) => previewResult("theme.rollback", stringInput(input, "snapshotId", "snapshot"), "Theme rollback preview generated.", context)
  }
];

export function listTools(): Array<{ name: string; description: string; inputSchema: Record<string, unknown> }> {
  return tools.map(({ name, description, inputSchema }) => ({ name, description, inputSchema }));
}

export async function callTool(name: string, input: Record<string, unknown>, context?: ToolContext): Promise<unknown> {
  const tool = tools.find((candidate) => candidate.name === name);
  if (!tool) throw new Error(`Unknown tool: ${name}`);
  return tool.handler(input, context ?? await createDefaultContext());
}
