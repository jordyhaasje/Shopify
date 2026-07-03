import { normalizeStoreUrl, type StoreAgentConfig } from "./config.js";

export interface GraphqlRequestOptions {
  query: string;
  variables?: Record<string, unknown>;
}

export interface FetchLikeResponse {
  ok: boolean;
  status: number;
  text(): Promise<string>;
}

export type FetchLike = (url: string, init: {
  method: string;
  headers: Record<string, string>;
  body: string;
}) => Promise<FetchLikeResponse>;

export interface GraphqlUserError {
  field?: string[];
  message: string;
}

export interface ShopifyGraphqlError {
  type: "missing_token" | "invalid_store" | "http_error" | "non_json" | "graphql_errors" | "access_denied" | "invalid_response";
  message: string;
  status?: number;
  accessDenied?: boolean;
  graphQLErrors?: Array<{ message: string; code?: string }>;
}

export type ShopifyGraphqlResult<T> =
  | {
    ok: true;
    status: number;
    data: T;
    extensions?: unknown;
    userErrors: GraphqlUserError[];
  }
  | {
    ok: false;
    status?: number;
    error: ShopifyGraphqlError;
    userErrors: GraphqlUserError[];
  };

export class ShopifyGraphqlClient {
  constructor(
    private readonly config: StoreAgentConfig,
    private readonly fetcher: FetchLike = fetch
  ) {}

  async request<T>(options: GraphqlRequestOptions): Promise<ShopifyGraphqlResult<T>> {
    if (!this.config.adminAccessToken) {
      return failure("missing_token", "Missing Shopify Admin API token.");
    }

    let storeUrl: string;
    try {
      storeUrl = normalizeStoreUrl(this.config.storeUrl);
    } catch {
      return failure("invalid_store", "Invalid or missing Shopify store URL.");
    }

    const response = await this.fetcher(`https://${storeUrl}/admin/api/${this.config.apiVersion}/graphql.json`, {
      method: "POST",
      headers: {
        "Accept": "application/json",
        "Content-Type": "application/json",
        "X-Shopify-Access-Token": this.config.adminAccessToken
      },
      body: JSON.stringify({
        query: options.query,
        variables: options.variables ?? {}
      })
    });

    const raw = await response.text();
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      return failure("non_json", `Shopify returned a non-JSON response with status ${response.status}.`, response.status);
    }

    const userErrors = collectUserErrors(parsed);

    if (!response.ok) {
      return failure(
        inferAccessDenied(parsed, response.status) ? "access_denied" : "http_error",
        `Shopify GraphQL HTTP request failed with status ${response.status}.`,
        response.status,
        parsed,
        userErrors
      );
    }

    if (isGraphqlErrorEnvelope(parsed)) {
      const accessDenied = parsed.errors.some((error) => isAccessDeniedMessage(error.message) || error.extensions?.code === "ACCESS_DENIED");
      return {
        ok: false,
        status: response.status,
        error: {
          type: accessDenied ? "access_denied" : "graphql_errors",
          message: accessDenied ? "Shopify GraphQL request was denied. Check app scopes and permissions." : "Shopify GraphQL returned errors.",
          status: response.status,
          accessDenied,
          graphQLErrors: parsed.errors.map((error) => ({
            message: error.message,
            code: typeof error.extensions?.code === "string" ? error.extensions.code : undefined
          }))
        },
        userErrors
      };
    }

    if (!isGraphqlDataEnvelope(parsed)) {
      return failure("invalid_response", "Shopify GraphQL response did not include a data object.", response.status, parsed, userErrors);
    }

    return {
      ok: true,
      status: response.status,
      data: parsed.data as T,
      extensions: parsed.extensions,
      userErrors
    };
  }
}

export function collectUserErrors(value: unknown): GraphqlUserError[] {
  const found: GraphqlUserError[] = [];
  collectUserErrorsFromValue(value, found);
  return found;
}

function collectUserErrorsFromValue(value: unknown, found: GraphqlUserError[]): void {
  if (!value || typeof value !== "object") return;
  if (Array.isArray(value)) {
    for (const item of value) collectUserErrorsFromValue(item, found);
    return;
  }

  const record = value as Record<string, unknown>;
  if (Array.isArray(record.userErrors)) {
    for (const item of record.userErrors) {
      if (item && typeof item === "object" && typeof (item as { message?: unknown }).message === "string") {
        const field = (item as { field?: unknown }).field;
        found.push({
          field: Array.isArray(field) ? field.map(String) : undefined,
          message: (item as { message: string }).message
        });
      }
    }
  }

  for (const nested of Object.values(record)) {
    collectUserErrorsFromValue(nested, found);
  }
}

function failure(
  type: ShopifyGraphqlError["type"],
  message: string,
  status?: number,
  parsed?: unknown,
  userErrors: GraphqlUserError[] = []
): ShopifyGraphqlResult<never> {
  return {
    ok: false,
    status,
    error: {
      type,
      message,
      status,
      accessDenied: type === "access_denied" || inferAccessDenied(parsed, status)
    },
    userErrors
  };
}

function inferAccessDenied(parsed: unknown, status?: number): boolean {
  if (status === 401 || status === 403) return true;
  if (!parsed) return false;
  return JSON.stringify(parsed).toLowerCase().includes("access denied") ||
    JSON.stringify(parsed).toLowerCase().includes("insufficient");
}

function isAccessDeniedMessage(message: string): boolean {
  const lower = message.toLowerCase();
  return lower.includes("access denied") || lower.includes("insufficient") || lower.includes("scope");
}

function isGraphqlDataEnvelope(value: unknown): value is { data: unknown; extensions?: unknown } {
  return Boolean(value && typeof value === "object" && "data" in value);
}

function isGraphqlErrorEnvelope(value: unknown): value is { errors: Array<{ message: string; extensions?: { code?: unknown } }> } {
  return Boolean(
    value &&
    typeof value === "object" &&
    "errors" in value &&
    Array.isArray((value as { errors: unknown }).errors)
  );
}
