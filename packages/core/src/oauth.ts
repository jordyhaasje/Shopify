import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { normalizeStoreUrl } from "./config.js";
import { normalizeScopes, scopesToString } from "./scopes.js";

export interface OAuthInstallOptions {
  shop: string;
  clientId: string;
  scopes: readonly string[] | string;
  redirectUri: string;
  state?: string;
  accessMode?: "offline" | "per-user";
}

export interface OAuthCallbackQuery {
  code?: string;
  hmac?: string;
  host?: string;
  shop?: string;
  state?: string;
  timestamp?: string;
  [key: string]: string | undefined;
}

export interface TokenExchangeOptions {
  shop: string;
  clientId: string;
  clientSecret: string;
  code: string;
  expiring?: boolean;
}

export interface ShopifyTokenResponse {
  access_token: string;
  scope: string;
  expires_in?: number;
  refresh_token?: string;
  refresh_token_expires_in?: number;
}

export type TokenFetch = (url: string, init: {
  method: string;
  headers: Record<string, string>;
  body: string;
}) => Promise<{ ok: boolean; status: number; text(): Promise<string> }>;

export function createOAuthState(): string {
  return randomBytes(24).toString("hex");
}

export function buildInstallUrl(options: OAuthInstallOptions): URL {
  const shop = normalizeStoreUrl(options.shop);
  const state = options.state ?? createOAuthState();
  const url = new URL(`https://${shop}/admin/oauth/authorize`);
  url.searchParams.set("client_id", options.clientId);
  url.searchParams.set("scope", scopesToString(normalizeScopes(options.scopes)));
  url.searchParams.set("redirect_uri", options.redirectUri);
  url.searchParams.set("state", state);
  if (options.accessMode === "per-user") {
    url.searchParams.append("grant_options[]", "per-user");
  }
  return url;
}

export function validateOAuthCallback(query: OAuthCallbackQuery, expectedState: string, clientSecret: string): void {
  if (!query.shop) throw new Error("OAuth callback is missing shop.");
  if (!query.code) throw new Error("OAuth callback is missing code.");
  if (!query.hmac) throw new Error("OAuth callback is missing hmac.");
  if (query.state !== expectedState) throw new Error("OAuth state mismatch.");
  if (!isValidShopifyHmac(query, clientSecret)) throw new Error("OAuth HMAC validation failed.");
}

export function isValidShopifyHmac(query: OAuthCallbackQuery, clientSecret: string): boolean {
  if (!query.hmac) return false;
  const message = Object.entries(query)
    .filter(([key, value]) => key !== "hmac" && key !== "signature" && value !== undefined)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => `${key}=${value}`)
    .join("&");
  const digest = createHmac("sha256", clientSecret).update(message).digest("hex");
  return safeCompareHex(digest, query.hmac);
}

export async function exchangeCodeForOfflineToken(
  options: TokenExchangeOptions,
  fetcher: TokenFetch = fetch
): Promise<ShopifyTokenResponse> {
  const shop = normalizeStoreUrl(options.shop);
  const params = new URLSearchParams({
    client_id: options.clientId,
    client_secret: options.clientSecret,
    code: options.code
  });
  if (options.expiring !== undefined) params.set("expiring", options.expiring ? "1" : "0");

  const response = await fetcher(`https://${shop}/admin/oauth/access_token`, {
    method: "POST",
    headers: {
      "Accept": "application/json",
      "Content-Type": "application/x-www-form-urlencoded"
    },
    body: params.toString()
  });
  const raw = await response.text();
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error(`Shopify token exchange returned non-JSON response with status ${response.status}.`);
  }
  if (!response.ok) {
    throw new Error(`Shopify token exchange failed with status ${response.status}: ${raw}`);
  }
  if (!isTokenResponse(parsed)) {
    throw new Error("Shopify token exchange response did not include an access token.");
  }
  return parsed;
}

function safeCompareHex(left: string, right: string): boolean {
  try {
    const leftBuffer = Buffer.from(left, "hex");
    const rightBuffer = Buffer.from(right, "hex");
    if (leftBuffer.length !== rightBuffer.length) return false;
    return timingSafeEqual(leftBuffer, rightBuffer);
  } catch {
    return false;
  }
}

function isTokenResponse(value: unknown): value is ShopifyTokenResponse {
  return Boolean(
    value &&
    typeof value === "object" &&
    "access_token" in value &&
    typeof (value as { access_token: unknown }).access_token === "string" &&
    "scope" in value &&
    typeof (value as { scope: unknown }).scope === "string"
  );
}
