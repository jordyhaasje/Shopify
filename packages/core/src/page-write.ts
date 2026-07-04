import type { StoreAgentConfig } from "./config.js";
import { ShopifyGraphqlClient, type FetchLike, type GraphqlUserError, type ShopifyGraphqlResult } from "./shopify-client.js";

export interface PageCreateInput {
  title: string;
  body?: string;
  handle?: string;
  isPublished?: boolean;
  templateSuffix?: string;
}

export interface PageCreateSummary {
  id: string;
  title?: string;
  handle?: string;
}

export interface PageWriteDiagnostic {
  severity: "warning" | "error";
  code: string;
  message: string;
}

export interface PageCreateResult {
  ok: boolean;
  status: "ok" | "blocked" | "missing_input" | "user_errors" | "shopify_error" | "invalid_response";
  summary: string;
  page?: PageCreateSummary;
  userErrors: GraphqlUserError[];
  diagnostics: PageWriteDiagnostic[];
}

export interface PageWriteOptions {
  fetcher?: FetchLike;
}

interface PageCreateData {
  pageCreate?: {
    page?: {
      id?: unknown;
      title?: unknown;
      handle?: unknown;
    } | null;
    userErrors?: GraphqlUserError[];
  } | null;
}

export async function createPage(
  config: StoreAgentConfig,
  input: PageCreateInput,
  options: PageWriteOptions = {}
): Promise<PageCreateResult> {
  if (config.readOnly) return blocked("Page create is blocked because read-only mode is enabled.");

  const title = safeText(input.title, 255);
  if (!title) return missingInput("Provide a page title.");

  const page: Record<string, unknown> = { title };
  const body = safeText(input.body, 5000);
  if (body) page.body = body;
  const handle = safeHandle(input.handle);
  if (handle) page.handle = handle;
  if (typeof input.isPublished === "boolean") page.isPublished = input.isPublished;
  const templateSuffix = safeHandle(input.templateSuffix);
  if (templateSuffix) page.templateSuffix = templateSuffix;

  const client = new ShopifyGraphqlClient(config, options.fetcher);
  let result: ShopifyGraphqlResult<PageCreateData>;
  try {
    result = await client.request<PageCreateData>({
      query: pageCreateMutation,
      variables: { page }
    });
  } catch {
    return shopifyFailure("Shopify page create request failed before a safe response was available.");
  }

  if (!result.ok) return mapGraphqlFailure(result);

  const userErrors = result.data.pageCreate?.userErrors ?? result.userErrors;
  if (userErrors.length > 0) {
    return {
      ok: false,
      status: "user_errors",
      summary: "Shopify rejected the page create request.",
      userErrors: sanitizeUserErrors(userErrors),
      diagnostics: [{ severity: "warning", code: "shopify_user_errors", message: "Shopify returned page create user errors." }]
    };
  }

  const pageNode = result.data.pageCreate?.page;
  const id = safeText(pageNode?.id, 180);
  if (!id) {
    return {
      ok: false,
      status: "invalid_response",
      summary: "Shopify page create response did not include a created page ID.",
      userErrors: [],
      diagnostics: [{ severity: "error", code: "invalid_response", message: "Shopify page create response did not include a created page ID." }]
    };
  }

  const created = {
    id,
    title: safeText(pageNode?.title, 255),
    handle: safeHandle(pageNode?.handle)
  };
  return {
    ok: true,
    status: "ok",
    summary: `Created Shopify page "${created.title ?? created.handle ?? created.id}".`,
    page: created,
    userErrors: [],
    diagnostics: []
  };
}

const pageCreateMutation = /* GraphQL */ `
  mutation ShopifyStoreAgentPageCreate($page: PageCreateInput!) {
    pageCreate(page: $page) {
      page {
        id
        title
        handle
      }
      userErrors {
        field
        message
      }
    }
  }
`;

function mapGraphqlFailure(result: Extract<ShopifyGraphqlResult<PageCreateData>, { ok: false }>): PageCreateResult {
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

function missingInput(message: string): PageCreateResult {
  return {
    ok: false,
    status: "missing_input",
    summary: message,
    userErrors: [],
    diagnostics: [{ severity: "warning", code: "missing_input", message }]
  };
}

function blocked(message: string): PageCreateResult {
  return {
    ok: false,
    status: "blocked",
    summary: message,
    userErrors: [],
    diagnostics: [{ severity: "warning", code: "read_only", message }]
  };
}

function shopifyFailure(message: string): PageCreateResult {
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
    message: safeText(error.message, 240) ?? "[redacted]"
  }));
}

function safeHandle(value: unknown): string | undefined {
  const text = safeText(value, 180);
  if (!text) return undefined;
  return text.replace(/[^a-zA-Z0-9_-]/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "").slice(0, 180) || undefined;
}

function safeText(value: unknown, maxLength: number): string | undefined {
  if (typeof value !== "string" || !value.trim()) return undefined;
  const trimmed = value.trim();
  if (looksLikeSecret(trimmed)) return "[redacted]";
  return trimmed.length > maxLength ? `${trimmed.slice(0, maxLength)}...` : trimmed;
}

function looksLikeSecret(value: string): boolean {
  return /shpat_[A-Za-z0-9_]+|shpua_[A-Za-z0-9_]+|ghp_[A-Za-z0-9_]+|Bearer\s+[A-Za-z0-9._-]+/i.test(value);
}
