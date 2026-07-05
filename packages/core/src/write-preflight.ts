import type { StoreAgentConfig } from "./config.js";
import { normalizeScopes } from "./scopes.js";

export interface WritePreflightDiagnostic {
  severity: "warning" | "error";
  code: string;
  message: string;
}

export interface WriteScopePreflightResult {
  ok: boolean;
  status: "ok" | "blocked";
  tool: string;
  requiredScopes: string[];
  grantedScopesKnown: boolean;
  diagnostics: WritePreflightDiagnostic[];
}

export const pageCreateWriteScopes = ["write_content", "write_online_store_pages"] as const;
export const productCreateWriteScopes = ["write_products"] as const;
export const productUpdateWriteScopes = ["write_products"] as const;
export const collectionCreateWriteScopes = ["write_products"] as const;
export const inventorySetQuantityWriteScopes = ["write_inventory"] as const;
export const inventoryAdjustQuantityWriteScopes = ["write_inventory"] as const;

type WriteExecuteTool = "page.create.execute" | "product.create.execute" | "product.update.execute" | "collection.create.execute" | "inventory.setQuantity.execute" | "inventory.adjustQuantity.execute";

export function checkWriteScopePreflight(config: StoreAgentConfig, tool: WriteExecuteTool): WriteScopePreflightResult {
  const requiredScopes = requiredWriteScopes(tool);
  const grantedScopes = Array.isArray(config.grantedScopes) ? normalizeScopes(config.grantedScopes).map((scope) => scope.toLowerCase()) : undefined;

  if (!grantedScopes) {
    return blocked(tool, requiredScopes, false, "unknown_write_scopes", `${tool} fails closed before Shopify write execution because local granted scopes are unknown.`);
  }

  const hasScope = requiredScopes.some((scope) => grantedScopes.includes(scope.toLowerCase()));
  if (!hasScope) {
    return blocked(tool, requiredScopes, true, "missing_write_scope", `${tool} requires ${formatScopeList(requiredScopes)} in local granted scopes before Shopify write execution.`);
  }

  return {
    ok: true,
    status: "ok",
    tool,
    requiredScopes: [...requiredScopes],
    grantedScopesKnown: true,
    diagnostics: []
  };
}

function requiredWriteScopes(tool: WriteExecuteTool): readonly string[] {
  if (tool === "page.create.execute") return pageCreateWriteScopes;
  if (tool === "product.create.execute") return productCreateWriteScopes;
  if (tool === "product.update.execute") return productUpdateWriteScopes;
  if (tool === "collection.create.execute") return collectionCreateWriteScopes;
  if (tool === "inventory.setQuantity.execute") return inventorySetQuantityWriteScopes;
  if (tool === "inventory.adjustQuantity.execute") return inventoryAdjustQuantityWriteScopes;
  return [];
}

function formatScopeList(scopes: readonly string[]): string {
  if (scopes.length <= 1) return scopes[0] ?? "a write scope";
  return `${scopes.slice(0, -1).join(", ")} or ${scopes[scopes.length - 1]}`;
}

function blocked(
  tool: string,
  requiredScopes: readonly string[],
  grantedScopesKnown: boolean,
  code: string,
  message: string
): WriteScopePreflightResult {
  return {
    ok: false,
    status: "blocked",
    tool,
    requiredScopes: [...requiredScopes],
    grantedScopesKnown,
    diagnostics: [{ severity: "warning", code, message }]
  };
}
