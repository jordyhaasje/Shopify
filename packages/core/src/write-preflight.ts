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

export function checkWriteScopePreflight(config: StoreAgentConfig, tool: "page.create.execute"): WriteScopePreflightResult {
  const requiredScopes = requiredWriteScopes(tool);
  const grantedScopes = Array.isArray(config.grantedScopes) ? normalizeScopes(config.grantedScopes).map((scope) => scope.toLowerCase()) : undefined;

  if (!grantedScopes) {
    return blocked(tool, requiredScopes, false, "unknown_write_scopes", "Local granted scopes are unknown; page.create.execute fails closed before Shopify write execution.");
  }

  const hasScope = requiredScopes.some((scope) => grantedScopes.includes(scope.toLowerCase()));
  if (!hasScope) {
    return blocked(tool, requiredScopes, true, "missing_write_scope", "page.create.execute requires write_content or write_online_store_pages in local granted scopes before Shopify write execution.");
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

function requiredWriteScopes(tool: "page.create.execute"): readonly string[] {
  if (tool === "page.create.execute") return pageCreateWriteScopes;
  return [];
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
