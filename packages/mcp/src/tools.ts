import {
  MemoryAuditLog,
  assertThemeApplyAllowed,
  assertWritable,
  createBulkPreview,
  createConfig,
  createRefundPreview,
  emptyCapabilities,
  loadStoredConfig,
  planThemeSection,
  redactConfig,
  summarizeCapabilities,
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
}

function booleanInput(input: Record<string, unknown>, key: string): boolean {
  return input[key] === true;
}

function stringInput(input: Record<string, unknown>, key: string, fallback = ""): string {
  const value = input[key];
  return typeof value === "string" ? value : fallback;
}

function previewResult(tool: string, target: string, summary: string, context: ToolContext): Record<string, unknown> {
  const audit = context.audit.record({
    tool,
    target,
    mode: "preview",
    summary,
    result: "success"
  });
  return { ok: true, mode: "preview", summary, audit };
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

function executePlaceholder(tool: string, target: string, summary: string, input: Record<string, unknown>, context: ToolContext): Record<string, unknown> {
  const confirmed = booleanInput(input, "confirmed");
  assertWritable(context.config, tool, confirmed);
  const audit = context.audit.record({
    tool,
    target,
    mode: "execute",
    summary,
    result: "success"
  });
  return { ok: true, mode: "execute", summary, audit, placeholder: true };
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
    audit: new MemoryAuditLog()
  };
}

export const tools: ToolDefinition[] = [
  {
    name: "shopify.capabilities.check",
    description: "Check local Shopify Store Agent config and known capability flags.",
    inputSchema: { type: "object" },
    handler: (_input, context) => readResult(
      "shopify.capabilities.check",
      context.config.storeUrl,
      "Capability check placeholder generated from local config.",
      context,
      {
        config: redactConfig(context.config),
        capabilities: summarizeCapabilities(context.config.capabilities ?? emptyCapabilities())
      }
    )
  },
  {
    name: "product.create.preview",
    description: "Preview creating a Shopify product from user-provided data. Does not search for products autonomously.",
    inputSchema: { type: "object" },
    handler: (input, context) => previewResult("product.create.preview", stringInput(input, "title", "product"), "Product create preview generated.", context)
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
    handler: (input, context) => previewResult("product.update.preview", stringInput(input, "productId", "product"), "Product update preview generated.", context)
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
    handler: (input, context) => previewResult("product.media.update.preview", stringInput(input, "productId", "product"), "Product media update preview generated.", context)
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
    handler: (input, context) => previewResult("product.importFromUserUrl.preview", stringInput(input, "url", "product-url"), "Product import-from-URL preview generated.", context)
  },
  {
    name: "product.importFromUserUrl.execute",
    description: "Placeholder for creating/updating a product from a reviewed user-provided URL import preview.",
    inputSchema: { type: "object" },
    handler: (input, context) => executePlaceholder("product.importFromUserUrl.execute", stringInput(input, "url", "product-url"), "Product import-from-URL execution placeholder.", input, context)
  },
  {
    name: "order.find",
    description: "Find order candidates by explicit order number, customer email, or order ID.",
    inputSchema: { type: "object" },
    handler: (input, context) => readResult("order.find", stringInput(input, "query", "order"), "Order find request prepared.", context)
  },
  {
    name: "order.get",
    description: "Get an order by explicit Shopify order ID.",
    inputSchema: { type: "object" },
    handler: (input, context) => readResult("order.get", stringInput(input, "orderId", "order"), "Order get request prepared.", context)
  },
  {
    name: "customer.find",
    description: "Find customer candidates by user-provided email, name, phone, or Shopify ID.",
    inputSchema: { type: "object" },
    handler: (input, context) => readResult("customer.find", stringInput(input, "query", "customer"), "Customer find request prepared.", context)
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
      idempotencyKey: stringInput(input, "idempotencyKey")
    })
  },
  {
    name: "tracking.get",
    description: "Get tracking details by explicit order, fulfillment, or tracking input.",
    inputSchema: { type: "object" },
    handler: (input, context) => readResult("tracking.get", stringInput(input, "query", "tracking"), "Tracking get request prepared.", context)
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
    handler: (input, context) => previewResult("page.create.preview", stringInput(input, "title", "page"), "Page create preview generated.", context)
  },
  {
    name: "page.create.execute",
    description: "Placeholder for page creation after preview and confirmation.",
    inputSchema: { type: "object" },
    handler: (input, context) => executePlaceholder("page.create.execute", stringInput(input, "title", "page"), "Page create execution placeholder.", input, context)
  },
  {
    name: "collection.create.preview",
    description: "Preview collection creation from explicit user criteria or product IDs.",
    inputSchema: { type: "object" },
    handler: (input, context) => previewResult("collection.create.preview", stringInput(input, "title", "collection"), "Collection create preview generated.", context)
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
      const confirmed = booleanInput(input, "confirmed");
      assertThemeApplyAllowed(previewId, confirmed);
      const confirmedPreviewId = previewId ?? "";
      const result = executePlaceholder("theme.apply", confirmedPreviewId, "Theme apply execution placeholder.", input, context);
      return { ...result, previewId };
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
