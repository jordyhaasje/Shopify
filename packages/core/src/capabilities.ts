import { CapabilitySnapshot, StoreAgentConfig } from "./config.js";

export type ThemeWriteRoute = "graphql-theme-files" | "rest-assets" | "shopify-cli" | "unavailable";

export interface CapabilityProbe {
  name: keyof CapabilitySnapshot;
  ok: boolean;
  detail: string;
}

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
  return [
    "refund.execute",
    "tracking.update",
    "customer.updateAddress",
    "product.update",
    "product.create",
    "bulk.execute",
    "theme.apply"
  ].includes(toolName);
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
