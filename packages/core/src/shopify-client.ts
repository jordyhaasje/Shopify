import { StoreAgentConfig } from "./config.js";

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

export class ShopifyGraphqlClient {
  constructor(
    private readonly config: StoreAgentConfig,
    private readonly fetcher: FetchLike = fetch
  ) {}

  async request<T>(options: GraphqlRequestOptions): Promise<T> {
    if (!this.config.adminAccessToken) {
      throw new Error("Missing Shopify Admin API token.");
    }

    const url = `https://${this.config.storeUrl}/admin/api/${this.config.apiVersion}/graphql.json`;
    const response = await this.fetcher(url, {
      method: "POST",
      headers: {
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
      throw new Error(`Shopify returned non-JSON response with status ${response.status}.`);
    }

    if (!response.ok) {
      throw new Error(`Shopify GraphQL request failed with status ${response.status}: ${raw}`);
    }

    if (isGraphqlErrorEnvelope(parsed)) {
      throw new Error(`Shopify GraphQL errors: ${parsed.errors.map((error) => error.message).join("; ")}`);
    }

    return parsed as T;
  }
}

function isGraphqlErrorEnvelope(value: unknown): value is { errors: Array<{ message: string }> } {
  return Boolean(
    value &&
    typeof value === "object" &&
    "errors" in value &&
    Array.isArray((value as { errors: unknown }).errors)
  );
}
