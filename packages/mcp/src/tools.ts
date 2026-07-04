import {
  MemoryAuditLog,
  assertWritable,
  checkShopifyCapabilities,
  type CatalogPreviewResult,
  createBulkPreview,
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
  loadStoredConfig,
  MemoryPreviewStore,
  planThemeSection,
  previewRecordBindingTarget,
  type PageCreateInput,
  type PageCreateResult,
  type PreviewWarning,
  type ProductSummary,
  type ReadResult,
  type StoredPreviewRecord,
  validateExecutePreviewBinding,
  verifyStoredPreviewBinding,
  previewCollectionCreate,
  previewPageCreate,
  previewProductCreate,
  previewProductImportFromUserUrl,
  previewProductMediaUpdate,
  previewProductUpdate,
  type StoreAgentConfig
} from "@shopify-store-agent/core";

export interface ToolDefinition {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  handler: (input: Record<string, unknown>, context: ToolContext) => Promise<unknown> | unknown;
}

export interface ToolContext {
  config: StoreAgentConfig;
  audit: MemoryAuditLog;
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
  return { ...result, mode: "preview", audit, previewId: stored.previewId, previewHash: stored.previewHash, binding: previewBindingOutput(stored) };
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

  const write = await createPage(context.config, extracted.input, { fetcher: context.fetcher });
  return pageCreateWriteResult(tool, storedTarget, binding, write, context);
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
  binding?: ExecutePreviewBindingResult
): Record<string, unknown> {
  const safeTarget = safeExecuteString(target);
  const summary = "Execute blocked because page create preconditions were not met.";
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
      expectedTool: binding?.expectedPreviewTool ?? "page.create.preview",
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

function changeValue(record: StoredPreviewRecord, field: string): unknown {
  for (const item of arrayItems(record.proposedChanges)) {
    const change = objectFields(item);
    if (stringFromUnknown(change.field) === field) return unwrapStoredValue(change.value);
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

function pageExecuteTarget(input: Record<string, unknown>, context: ToolContext): string {
  const previewId = stringInput(input, "previewId");
  const lookup = previewId && context.previewStore ? context.previewStore.getPreview(previewId) : undefined;
  if (lookup?.record) return previewRecordBindingTarget(lookup.record);
  return safeExecuteString(stringInput(input, "target") || stringInput(input, "title", "page"));
}

function stringFromUnknown(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function diagnostic(code: string, message: string): ExecutePreviewBindingDiagnostic {
  return { code, message };
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
  const stored = await loadStoredConfig(process.env.SHOPIFY_STORE_AGENT_CONFIG);
  return {
    config: stored ?? createConfig({
      storeUrl: process.env.SHOPIFY_STORE_AGENT_STORE ?? "example.myshopify.com",
      adminAccessToken: process.env.SHOPIFY_STORE_AGENT_ADMIN_TOKEN,
      themeAccessToken: process.env.SHOPIFY_STORE_AGENT_THEME_TOKEN,
      readOnly: process.env.SHOPIFY_STORE_AGENT_READ_ONLY !== "false",
      capabilities: emptyCapabilities()
    }),
    audit: new MemoryAuditLog(),
    previewStore: new MemoryPreviewStore()
  };
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
    description: "Placeholder for creating a product after preview and explicit confirmation.",
    inputSchema: { type: "object" },
    handler: (input, context) => executePlaceholder("product.create.execute", stringInput(input, "title", "product"), "Product create execution placeholder.", input, context)
  },
  {
    name: "product.update.preview",
    description: "Preview updating price, media, variants, or description for an explicit product ID.",
    inputSchema: { type: "object" },
    handler: (input, context) => productUpdatePreviewResult(input, context)
  },
  {
    name: "product.update.execute",
    description: "Placeholder for updating an explicit product after preview and confirmation.",
    inputSchema: { type: "object" },
    handler: (input, context) => executePlaceholder("product.update.execute", stringInput(input, "productId", "product"), "Product update execution placeholder.", input, context)
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
    description: "Placeholder for collection creation after preview and confirmation.",
    inputSchema: { type: "object" },
    handler: (input, context) => executePlaceholder("collection.create.execute", stringInput(input, "title", "collection"), "Collection create execution placeholder.", input, context)
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
