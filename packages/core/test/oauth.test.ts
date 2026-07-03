import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { buildInstallUrl, exchangeCodeForOfflineToken, isValidShopifyHmac, validateOAuthCallback } from "../src/oauth.js";

describe("oauth", () => {
  it("builds an offline install URL", () => {
    const url = buildInstallUrl({
      shop: "demo",
      clientId: "client",
      scopes: ["read_products", "write_products"],
      redirectUri: "http://127.0.0.1:3456/auth/callback",
      state: "state"
    });

    expect(url.toString()).toContain("https://demo.myshopify.com/admin/oauth/authorize");
    expect(url.searchParams.get("scope")).toBe("read_products,write_products");
    expect(url.searchParams.get("state")).toBe("state");
  });

  it("validates Shopify callback hmac and state", () => {
    const secret = "secret";
    const query = {
      code: "code",
      host: "host",
      shop: "demo.myshopify.com",
      state: "state",
      timestamp: "123"
    };
    const message = Object.entries(query).sort(([left], [right]) => left.localeCompare(right)).map(([key, value]) => `${key}=${value}`).join("&");
    const hmac = createHmac("sha256", secret).update(message).digest("hex");

    expect(isValidShopifyHmac({ ...query, hmac }, secret)).toBe(true);
    expect(() => validateOAuthCallback({ ...query, hmac }, "state", secret)).not.toThrow();
    expect(() => validateOAuthCallback({ ...query, hmac }, "other", secret)).toThrow("state");
  });

  it("exchanges an auth code for an offline token", async () => {
    const token = await exchangeCodeForOfflineToken({
      shop: "demo",
      clientId: "client",
      clientSecret: "secret",
      code: "code"
    }, async (url, init) => {
      expect(url).toBe("https://demo.myshopify.com/admin/oauth/access_token");
      expect(init.body).toContain("client_id=client");
      return {
        ok: true,
        status: 200,
        async text() {
          return JSON.stringify({ access_token: "shpat_test", scope: "read_products" });
        }
      };
    });

    expect(token.access_token).toBe("shpat_test");
  });
});
