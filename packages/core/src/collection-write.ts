import type { StoreAgentConfig } from "./config.js";
import { ShopifyGraphqlClient, type FetchLike, type GraphqlUserError, type ShopifyGraphqlResult } from "./shopify-client.js";

export interface CollectionCreateInput {
  title: string;
  handle?: string;
  productIds: string[];
}

export interface CollectionCreateSummary {
  id: string;
  title?: string;
  handle?: string;
}

export interface CollectionWriteDiagnostic {
  severity: "warning" | "error";
  code: string;
  message: string;
}

export interface CollectionCreateResult {
  ok: boolean;
  status: "ok" | "blocked" | "missing_input" | "user_errors" | "shopify_error" | "invalid_response";
  summary: string;
  collection?: CollectionCreateSummary;
  userErrors: GraphqlUserError[];
  diagnostics: CollectionWriteDiagnostic[];
}

export interface CollectionWriteOptions {
  fetcher?: FetchLike;
}

interface CollectionCreateData {
  collectionCreate?: {
    collection?: {
      id?: unknown;
      title?: unknown;
      handle?: unknown;
    } | null;
    userErrors?: GraphqlUserError[];
  } | null;
}

export async function createCollection(
  config: StoreAgentConfig,
  input: CollectionCreateInput,
  options: CollectionWriteOptions = {}
): Promise<CollectionCreateResult> {
  if (config.readOnly) return blocked("Collection create is blocked because read-only mode is enabled.");

  const title = safeText(input.title, 255);
  if (!title) return missingInput("Provide a collection title.");

  const productIds = safeProductIds(input.productIds);
  if (productIds.length === 0) return missingInput("Provide at least one explicit product ID for collection create.");

  const collection: Record<string, unknown> = {
    title,
    sources: [{
      source: {
        title: `${title} product selections`,
        inclusion: {
          selections: productIds.map((productId) => ({ productId }))
        }
      }
    }]
  };
  const handle = safeHandle(input.handle);
  if (handle) collection.handle = handle;

  const client = new ShopifyGraphqlClient(config, options.fetcher);
  let result: ShopifyGraphqlResult<CollectionCreateData>;
  try {
    result = await client.request<CollectionCreateData>({
      query: collectionCreateMutation,
      variables: { collection }
    });
  } catch {
    return shopifyFailure("Shopify collection create request failed before a safe response was available.");
  }

  if (!result.ok) return mapGraphqlFailure(result);

  const userErrors = result.data.collectionCreate?.userErrors ?? result.userErrors;
  if (userErrors.length > 0) {
    return {
      ok: false,
      status: "user_errors",
      summary: "Shopify rejected the collection create request.",
      userErrors: sanitizeUserErrors(userErrors),
      diagnostics: [{ severity: "warning", code: "shopify_user_errors", message: "Shopify returned collection create user errors." }]
    };
  }

  const collectionNode = result.data.collectionCreate?.collection;
  const id = safeText(collectionNode?.id, 180);
  if (!id) {
    return {
      ok: false,
      status: "invalid_response",
      summary: "Shopify collection create response did not include a created collection ID.",
      userErrors: [],
      diagnostics: [{ severity: "error", code: "invalid_response", message: "Shopify collection create response did not include a created collection ID." }]
    };
  }

  const created = {
    id,
    title: safeText(collectionNode?.title, 255),
    handle: safeHandle(collectionNode?.handle)
  };
  return {
    ok: true,
    status: "ok",
    summary: `Created Shopify collection "${created.title ?? created.handle ?? created.id}".`,
    collection: created,
    userErrors: [],
    diagnostics: []
  };
}

const collectionCreateMutation = /* GraphQL */ `
  mutation ShopifyStoreAgentCollectionCreate($collection: CollectionCreateInput!) {
    collectionCreate(collection: $collection) {
      collection {
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

function mapGraphqlFailure(result: Extract<ShopifyGraphqlResult<CollectionCreateData>, { ok: false }>): CollectionCreateResult {
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

function missingInput(message: string): CollectionCreateResult {
  return {
    ok: false,
    status: "missing_input",
    summary: message,
    userErrors: [],
    diagnostics: [{ severity: "warning", code: "missing_input", message }]
  };
}

function blocked(message: string): CollectionCreateResult {
  return {
    ok: false,
    status: "blocked",
    summary: message,
    userErrors: [],
    diagnostics: [{ severity: "warning", code: "read_only", message }]
  };
}

function shopifyFailure(message: string): CollectionCreateResult {
  return {
    ok: false,
    status: "shopify_error",
    summary: message,
    userErrors: [],
    diagnostics: [{ severity: "warning", code: "shopify_request_failed", message }]
  };
}

function sanitizeUserErrors(errors: GraphqlUserError[]): GraphqlUserError[] {
  return errors.map((error) => ({
    field: Array.isArray(error.field) ? error.field.map((field) => safeText(field, 120)).filter((field): field is string => Boolean(field)) : undefined,
    message: safeText(error.message, 500) ?? "Shopify returned a user error."
  }));
}

function safeProductIds(values: readonly unknown[] | undefined): string[] {
  if (!Array.isArray(values)) return [];
  return values.map((value) => safeText(value, 180)).filter((value): value is string => Boolean(value));
}

function safeText(value: unknown, maxLength: number): string | undefined {
  if (typeof value !== "string") return undefined;
  if (looksLikeSecret(value)) return undefined;
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  return trimmed.length > maxLength ? trimmed.slice(0, maxLength) : trimmed;
}

function safeHandle(value: unknown): string | undefined {
  const text = safeText(value, 255);
  return text?.toLowerCase().replace(/[^a-z0-9-_]+/g, "-").replace(/^-+|-+$/g, "") || undefined;
}

function looksLikeSecret(value: string): boolean {
  return /shpat_[A-Za-z0-9_]+|shpua_[A-Za-z0-9_]+|ghp_[A-Za-z0-9_]+|Bearer\s+[A-Za-z0-9._-]+/i.test(value);
}
