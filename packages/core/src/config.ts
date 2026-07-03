export interface StoreAgentConfig {
  storeUrl: string;
  adminAccessToken?: string;
  themeAccessToken?: string;
  apiVersion: string;
  readOnly: boolean;
  auditLogPath?: string;
  capabilities?: CapabilitySnapshot;
}

export interface CapabilitySnapshot {
  adminApi: boolean;
  productWrite: boolean;
  orderRead: boolean;
  refundWrite: boolean;
  themeGraphqlFiles: boolean;
  themeRestAssets: boolean;
  themeCli: boolean;
}

export const defaultApiVersion = "2026-07";

export function normalizeStoreUrl(input: string): string {
  const trimmed = input.trim().replace(/^https?:\/\//, "").replace(/\/+$/, "");
  if (!trimmed) throw new Error("Store URL is required.");
  return trimmed.includes(".") ? trimmed : `${trimmed}.myshopify.com`;
}

export function createConfig(input: Partial<StoreAgentConfig> & { storeUrl: string }): StoreAgentConfig {
  return {
    storeUrl: normalizeStoreUrl(input.storeUrl),
    adminAccessToken: input.adminAccessToken,
    themeAccessToken: input.themeAccessToken,
    apiVersion: input.apiVersion ?? defaultApiVersion,
    readOnly: input.readOnly ?? true,
    auditLogPath: input.auditLogPath,
    capabilities: input.capabilities
  };
}

export function redactSecret(value: string | undefined): string | undefined {
  if (!value) return undefined;
  if (value.length <= 8) return "********";
  return `${value.slice(0, 4)}...${value.slice(-4)}`;
}

export function redactConfig(config: StoreAgentConfig): StoreAgentConfig {
  return {
    ...config,
    adminAccessToken: redactSecret(config.adminAccessToken),
    themeAccessToken: redactSecret(config.themeAccessToken)
  };
}
