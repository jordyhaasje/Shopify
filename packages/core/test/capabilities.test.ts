import { describe, expect, it } from "vitest";
import { checkShopifyCapabilities, chooseThemeWriteRoute, emptyCapabilities } from "../src/capabilities.js";
import { createConfig } from "../src/config.js";

describe("capability routing", () => {
  it("prefers GraphQL theme files, then REST assets, then CLI", () => {
    expect(chooseThemeWriteRoute({ ...emptyCapabilities(), themeCli: true })).toBe("shopify-cli");
    expect(chooseThemeWriteRoute({ ...emptyCapabilities(), themeCli: true, themeRestAssets: true })).toBe("rest-assets");
    expect(chooseThemeWriteRoute({ ...emptyCapabilities(), themeGraphqlFiles: true, themeRestAssets: true, themeCli: true })).toBe("graphql-theme-files");
  });

  it("returns local-only diagnostics without live Shopify access", async () => {
    const result = await checkShopifyCapabilities(createConfig({ storeUrl: "demo" }));

    expect(result).toMatchObject({
      ok: true,
      mode: "local",
      store: {
        url: "demo.myshopify.com",
        apiVersion: "2026-07",
        readOnly: true,
        adminApiTokenConfigured: false,
        themeAccessTokenConfigured: false
      }
    });
    expect(result.config.adminAccessToken).toBeUndefined();
    expect(result.diagnostics.map((diagnostic) => diagnostic.code)).toContain("missing_admin_token");
  });

  it("uses mocked fetch for optional live mode and redacts secrets", async () => {
    const result = await checkShopifyCapabilities(createConfig({
      storeUrl: "demo",
      adminAccessToken: "shpat_test_secret",
      themeAccessToken: "theme_test_secret"
    }), {
      live: true,
      fetcher: async () => ({
        ok: true,
        status: 200,
        async text() {
          return JSON.stringify({
            data: {
              shop: {
                name: "Demo Shop",
                myshopifyDomain: "demo.myshopify.com",
                primaryDomain: { host: "example.com" }
              }
            }
          });
        }
      })
    });

    expect(result).toMatchObject({
      ok: true,
      mode: "live",
      store: {
        adminApiTokenConfigured: true,
        themeAccessTokenConfigured: true
      },
      live: {
        attempted: true,
        ok: true,
        shop: {
          name: "Demo Shop",
          myshopifyDomain: "demo.myshopify.com",
          primaryDomainHost: "example.com"
        }
      }
    });
    expect(JSON.stringify(result)).not.toContain("shpat_test_secret");
    expect(JSON.stringify(result)).not.toContain("theme_test_secret");
  });

  it("returns a live diagnostic instead of throwing when live mode fails", async () => {
    const result = await checkShopifyCapabilities(createConfig({
      storeUrl: "demo",
      adminAccessToken: "token"
    }), {
      live: true,
      fetcher: async () => ({
        ok: true,
        status: 200,
        async text() {
          return JSON.stringify({
            errors: [{ message: "Access denied", extensions: { code: "ACCESS_DENIED" } }]
          });
        }
      })
    });

    expect(result.live).toMatchObject({
      attempted: true,
      ok: false,
      diagnostic: {
        severity: "error",
        code: "live_check_access_denied"
      }
    });
  });
});
