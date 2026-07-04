import { describe, expect, it } from "vitest";
import { checkWriteScopePreflight, createConfig } from "../src/index.js";

describe("write scope preflight", () => {
  it("blocks page create when granted scopes are unknown", () => {
    const result = checkWriteScopePreflight(createConfig({
      storeUrl: "demo",
      readOnly: false
    }), "page.create.execute");

    expect(result).toMatchObject({
      ok: false,
      status: "blocked",
      grantedScopesKnown: false,
      requiredScopes: ["write_content", "write_online_store_pages"],
      diagnostics: [{ code: "unknown_write_scopes" }]
    });
  });

  it("blocks page create when known scopes miss page write scope", () => {
    const result = checkWriteScopePreflight(createConfig({
      storeUrl: "demo",
      readOnly: false,
      grantedScopes: ["read_content", "shpat_scope_secret"]
    }), "page.create.execute");
    const output = JSON.stringify(result);

    expect(result).toMatchObject({
      ok: false,
      status: "blocked",
      grantedScopesKnown: true,
      diagnostics: [{ code: "missing_write_scope" }]
    });
    expect(output).not.toContain("shpat_scope_secret");
  });

  it("allows page create when either accepted page write scope is known", () => {
    expect(checkWriteScopePreflight(createConfig({
      storeUrl: "demo",
      readOnly: false,
      grantedScopes: ["write_content"]
    }), "page.create.execute")).toMatchObject({ ok: true, status: "ok" });

    expect(checkWriteScopePreflight(createConfig({
      storeUrl: "demo",
      readOnly: false,
      grantedScopes: ["write_online_store_pages"]
    }), "page.create.execute")).toMatchObject({ ok: true, status: "ok" });
  });

  it("blocks product create when granted scopes are unknown", () => {
    const result = checkWriteScopePreflight(createConfig({
      storeUrl: "demo",
      readOnly: false
    }), "product.create.execute");

    expect(result).toMatchObject({
      ok: false,
      status: "blocked",
      grantedScopesKnown: false,
      requiredScopes: ["write_products"],
      diagnostics: [{ code: "unknown_write_scopes" }]
    });
  });

  it("blocks product create when known scopes miss write_products", () => {
    const result = checkWriteScopePreflight(createConfig({
      storeUrl: "demo",
      readOnly: false,
      grantedScopes: ["read_products", "shpat_scope_secret"]
    }), "product.create.execute");
    const output = JSON.stringify(result);

    expect(result).toMatchObject({
      ok: false,
      status: "blocked",
      grantedScopesKnown: true,
      requiredScopes: ["write_products"],
      diagnostics: [{ code: "missing_write_scope" }]
    });
    expect(output).not.toContain("shpat_scope_secret");
  });

  it("allows product create when write_products is known", () => {
    expect(checkWriteScopePreflight(createConfig({
      storeUrl: "demo",
      readOnly: false,
      grantedScopes: ["write_products"]
    }), "product.create.execute")).toMatchObject({
      ok: true,
      status: "ok",
      requiredScopes: ["write_products"]
    });
  });
});
