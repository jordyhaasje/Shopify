import { CapabilitySnapshot, redactConfig, StoreAgentConfig } from "./config.js";
import { FetchLike, ShopifyGraphqlClient, type ShopifyGraphqlResult } from "./shopify-client.js";

export type ThemeWriteRoute = "graphql-theme-files" | "rest-assets" | "shopify-cli" | "unavailable";

export interface CapabilityProbe {
  name: keyof CapabilitySnapshot;
  ok: boolean;
  detail: string;
}

export interface CapabilityDiagnostic {
  severity: "info" | "warning" | "error";
  code: string;
  message: string;
  recommendation?: string;
}

export interface CapabilityCheckOptions {
  live?: boolean;
  fetcher?: FetchLike;
}

export interface CapabilityCheckResult {
  ok: boolean;
  mode: "local" | "live";
  store: {
    url: string;
    apiVersion: string;
    readOnly: boolean;
    adminApiTokenConfigured: boolean;
    themeAccessTokenConfigured: boolean;
  };
  config: StoreAgentConfig;
  capabilities: CapabilityProbe[];
  diagnostics: CapabilityDiagnostic[];
  recommendations: string[];
  live?: {
    attempted: boolean;
    ok: boolean;
    shop?: {
      name?: string;
      myshopifyDomain?: string;
      primaryDomainHost?: string;
    };
    diagnostic?: CapabilityDiagnostic;
  };
}

const shopIdentityQuery = `#graphql
query ShopifyStoreAgentCapabilities {
  shop {
    name
    myshopifyDomain
    primaryDomain {
      host
    }
  }
}`;

export function emptyCapabilities(): CapabilitySnapshot {
  return {
    adminApi: false,
    productWrite: false,
    orderRead: false,
    refundWrite: false,
    themeGraphqlFiles: false,
    themeRestAssets: false,
    themeCli: false
  };
}

export function chooseThemeWriteRoute(capabilities: CapabilitySnapshot | undefined): ThemeWriteRoute {
  if (!capabilities) return "unavailable";
  if (capabilities.themeGraphqlFiles) return "graphql-theme-files";
  if (capabilities.themeRestAssets) return "rest-assets";
  if (capabilities.themeCli) return "shopify-cli";
  return "unavailable";
}

export function requiresConfirmation(toolName: string): boolean {
  return toolName.endsWith(".execute") || toolName === "theme.apply";
}

export function assertWritable(config: StoreAgentConfig, toolName: string, confirmed: boolean): void {
  if (config.readOnly) {
    throw new Error(`${toolName} is blocked because read-only mode is enabled.`);
  }
  if (requiresConfirmation(toolName) && !confirmed) {
    throw new Error(`${toolName} requires explicit confirmation after preview.`);
  }
}

export function summarizeCapabilities(capabilities: CapabilitySnapshot): CapabilityProbe[] {
  return Object.entries(capabilities).map(([name, ok]) => ({
    name: name as keyof CapabilitySnapshot,
    ok,
    detail: ok ? "available" : "not available"
  }));
}

export async function checkShopifyCapabilities(
  config: StoreAgentConfig,
  options: CapabilityCheckOptions = {}
): Promise<CapabilityCheckResult> {
  const diagnostics: CapabilityDiagnostic[] = [];
  const recommendations: string[] = [];
  const hasAdminToken = Boolean(config.adminAccessToken);
  const hasThemeToken = Boolean(config.themeAccessToken);

  if (!hasAdminToken) {
    diagnostics.push({
      severity: "warning",
      code: "missing_admin_token",
      message: "No Admin API token is configured.",
      recommendation: "Run local OAuth setup or configure a manual Admin API token before using live Shopify checks."
    });
    recommendations.push("Configure an Admin API token with the minimum scopes required for the enabled workflow.");
  }

  if (!hasThemeToken) {
    diagnostics.push({
      severity: "info",
      code: "missing_theme_token",
      message: "No Theme Access token is configured.",
      recommendation: "Only configure Theme Access when theme preview/apply workflows are enabled."
    });
  }

  if (config.readOnly) {
    recommendations.push("Read-only mode is enabled. Explicitly disable it only when you are ready to test write previews and guarded execute flows.");
  }

  const result: CapabilityCheckResult = {
    ok: diagnostics.every((diagnostic) => diagnostic.severity !== "error"),
    mode: options.live ? "live" : "local",
    store: {
      url: config.storeUrl,
      apiVersion: config.apiVersion,
      readOnly: config.readOnly,
      adminApiTokenConfigured: hasAdminToken,
      themeAccessTokenConfigured: hasThemeToken
    },
    config: redactConfig(config),
    capabilities: summarizeCapabilities(config.capabilities ?? emptyCapabilities()),
    diagnostics,
    recommendations
  };

  if (!options.live) return result;

  if (!hasAdminToken) {
    result.live = {
      attempted: false,
      ok: false,
      diagnostic: {
        severity: "warning",
        code: "live_check_skipped_missing_admin_token",
        message: "Live capability check was requested but skipped because no Admin API token is configured.",
        recommendation: "Configure an Admin API token and retry with live mode."
      }
    };
    return result;
  }

  const client = new ShopifyGraphqlClient(config, options.fetcher);
  const liveResult = await client.request<ShopIdentityData>({ query: shopIdentityQuery });
  result.live = mapLiveShopIdentity(liveResult);
  if (!result.live.ok && result.live.diagnostic) {
    result.diagnostics.push(result.live.diagnostic);
  }
  result.ok = result.diagnostics.every((diagnostic) => diagnostic.severity !== "error");
  return result;
}

interface ShopIdentityData {
  shop?: {
    name?: string;
    myshopifyDomain?: string;
    primaryDomain?: {
      host?: string;
    };
  };
}

function mapLiveShopIdentity(result: ShopifyGraphqlResult<ShopIdentityData>): NonNullable<CapabilityCheckResult["live"]> {
  if (!result.ok) {
    return {
      attempted: true,
      ok: false,
      diagnostic: {
        severity: result.error.accessDenied ? "error" : "warning",
        code: `live_check_${result.error.type}`,
        message: result.error.message,
        recommendation: result.error.accessDenied ? "Check Admin API token validity and app scopes." : "Retry live capability check after resolving the Shopify API diagnostic."
      }
    };
  }

  return {
    attempted: true,
    ok: true,
    shop: {
      name: result.data.shop?.name,
      myshopifyDomain: result.data.shop?.myshopifyDomain,
      primaryDomainHost: result.data.shop?.primaryDomain?.host
    }
  };
}
