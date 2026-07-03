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
    name: "product.create",
    description: "Preview or create a Shopify product from user-provided data. Does not search for products autonomously.",
    inputSchema: { type: "object" },
    handler: (input, context) => {
      const confirmed = booleanInput(input, "confirmed");
      if (!confirmed) return previewResult("product.create", stringInput(input, "title", "product"), "Product create preview generated.", context);
      assertWritable(context.config, "product.create", confirmed);
      return { ok: true, mode: "execute", summary: "Product create execution placeholder." };
    }
  },
  {
    name: "product.update",
    description: "Preview or update price, media, variants, or description for an explicit product ID.",
    inputSchema: { type: "object" },
    handler: (input, context) => {
      const confirmed = booleanInput(input, "confirmed");
      if (!confirmed) return previewResult("product.update", stringInput(input, "productId", "product"), "Product update preview generated.", context);
      assertWritable(context.config, "product.update", confirmed);
      return { ok: true, mode: "execute", summary: "Product update execution placeholder." };
    }
  },
  {
    name: "order.lookup",
    description: "Look up an order by explicit order number, customer email, or order ID.",
    inputSchema: { type: "object" },
    handler: (input, context) => previewResult("order.lookup", stringInput(input, "query", "order"), "Order lookup request prepared.", context)
  },
  {
    name: "customer.updateAddress",
    description: "Preview or update a customer address from explicit user-provided address data.",
    inputSchema: { type: "object" },
    handler: (input, context) => {
      const confirmed = booleanInput(input, "confirmed");
      if (!confirmed) return previewResult("customer.updateAddress", stringInput(input, "customerId", "customer"), "Customer address update preview generated.", context);
      assertWritable(context.config, "customer.updateAddress", confirmed);
      return { ok: true, mode: "execute", summary: "Customer address update execution placeholder." };
    }
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
    description: "Execute a refund only after an explicit preview and confirmation.",
    inputSchema: { type: "object" },
    handler: (input, context) => {
      const confirmed = booleanInput(input, "confirmed");
      assertWritable(context.config, "refund.execute", confirmed);
      return { ok: true, mode: "execute", summary: "Refund execution placeholder.", idempotencyKey: stringInput(input, "idempotencyKey") };
    }
  },
  {
    name: "tracking.update",
    description: "Preview or update fulfillment tracking number, company, and URL where Shopify/provider supports it.",
    inputSchema: { type: "object" },
    handler: (input, context) => {
      const confirmed = booleanInput(input, "confirmed");
      if (!confirmed) return previewResult("tracking.update", stringInput(input, "fulfillmentId", "fulfillment"), "Tracking update preview generated.", context);
      assertWritable(context.config, "tracking.update", confirmed);
      return { ok: true, mode: "execute", summary: "Tracking update execution placeholder." };
    }
  },
  {
    name: "page.create",
    description: "Preview creation of a Shopify page from user-provided title and body.",
    inputSchema: { type: "object" },
    handler: (input, context) => previewResult("page.create", stringInput(input, "title", "page"), "Page create preview generated.", context)
  },
  {
    name: "collection.create",
    description: "Preview creation of a Shopify collection from explicit user criteria or product IDs.",
    inputSchema: { type: "object" },
    handler: (input, context) => previewResult("collection.create", stringInput(input, "title", "collection"), "Collection create preview generated.", context)
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
    description: "Execute a previously reviewed bulk edit after explicit confirmation.",
    inputSchema: { type: "object" },
    handler: (input, context) => {
      const confirmed = booleanInput(input, "confirmed");
      assertWritable(context.config, "bulk.execute", confirmed);
      return { ok: true, mode: "execute", summary: "Bulk execution placeholder." };
    }
  },
  {
    name: "theme.analyzeReference",
    description: "Analyze a user-provided Shopify reference URL using rendered page signals, not private Liquid code.",
    inputSchema: { type: "object" },
    handler: (input, context) => previewResult("theme.analyzeReference", stringInput(input, "url", "reference"), "Reference URL analysis plan generated.", context)
  },
  {
    name: "theme.generateSection",
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
      assertWritable(context.config, "theme.apply", confirmed);
      return { ok: true, mode: "execute", summary: "Theme apply execution placeholder.", previewId };
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
