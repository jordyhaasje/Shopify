import { describe, expect, it } from "vitest";
import { createConfig, createPage, type FetchLike } from "../src/index.js";

describe("page write helper", () => {
  it("creates a page through the pageCreate mutation and returns a safe summary", async () => {
    const requests: Array<{ url: string; body: string; token?: string }> = [];
    const fetcher: FetchLike = async (url, init) => {
      requests.push({ url, body: init.body, token: init.headers["X-Shopify-Access-Token"] });
      return jsonResponse({
        data: {
          pageCreate: {
            page: {
              id: "gid://shopify/Page/1",
              title: "Care Guide",
              handle: "care-guide",
              rawNodeOnly: "do not return"
            },
            userErrors: []
          }
        }
      });
    };

    const result = await createPage(createConfig({
      storeUrl: "demo",
      adminAccessToken: "shpat_page_secret",
      readOnly: false
    }), {
      title: "Care Guide",
      body: "<p>Wash cold.</p>",
      handle: "care-guide",
      isPublished: false
    }, { fetcher });

    expect(result).toMatchObject({
      ok: true,
      status: "ok",
      page: {
        id: "gid://shopify/Page/1",
        title: "Care Guide",
        handle: "care-guide"
      }
    });
    expect(requests).toHaveLength(1);
    expect(requests[0].body).toContain("mutation ShopifyStoreAgentPageCreate");
    expect(requests[0].body).toContain("pageCreate");
    expect(requests[0].body).not.toContain("productCreate");
    expect(requests[0].body).not.toContain("collectionCreate");
    expect(requests[0].body).not.toContain("refundCreate");
    expect(JSON.stringify(result)).not.toContain("rawNodeOnly");
    expect(JSON.stringify(result)).not.toContain("shpat_page_secret");
  });

  it("returns Shopify user errors safely", async () => {
    const result = await createPage(config(), {
      title: "Care Guide",
      body: "<p>Wash cold.</p>"
    }, {
      fetcher: async () => jsonResponse({
        data: {
          pageCreate: {
            page: null,
            userErrors: [{ field: ["title"], message: "Title has already been taken." }]
          }
        }
      })
    });

    expect(result).toMatchObject({
      ok: false,
      status: "user_errors",
      userErrors: [{ field: ["title"], message: "Title has already been taken." }],
      diagnostics: [{ code: "shopify_user_errors" }]
    });
  });

  it("returns safe diagnostics for thrown network errors", async () => {
    const result = await createPage(config(), {
      title: "Care Guide"
    }, {
      fetcher: async () => {
        throw new Error("network failed with token shpat_thrown_page_secret");
      }
    });
    const output = JSON.stringify(result);

    expect(result).toMatchObject({
      ok: false,
      status: "shopify_error",
      diagnostics: [{ code: "shopify_request_failed" }]
    });
    expect(output).not.toContain("shpat_thrown_page_secret");
  });

  it("rejects missing title before calling Shopify", async () => {
    let fetchCalled = false;
    const result = await createPage(config(), {
      title: ""
    }, {
      fetcher: async () => {
        fetchCalled = true;
        return jsonResponse({});
      }
    });

    expect(result).toMatchObject({
      ok: false,
      status: "missing_input",
      diagnostics: [{ code: "missing_input" }]
    });
    expect(fetchCalled).toBe(false);
  });

  it("blocks read-only config before calling Shopify", async () => {
    let fetchCalled = false;
    const result = await createPage(createConfig({
      storeUrl: "demo",
      adminAccessToken: "shpat_page_secret",
      readOnly: true
    }), {
      title: "Care Guide"
    }, {
      fetcher: async () => {
        fetchCalled = true;
        return jsonResponse({});
      }
    });

    expect(result).toMatchObject({
      ok: false,
      status: "blocked",
      diagnostics: [{ code: "read_only" }]
    });
    expect(fetchCalled).toBe(false);
  });
});

function config() {
  return createConfig({
    storeUrl: "demo",
    adminAccessToken: "shpat_page_secret",
    readOnly: false
  });
}

function jsonResponse(body: unknown) {
  return {
    ok: true,
    status: 200,
    async text() {
      return JSON.stringify(body);
    }
  };
}
