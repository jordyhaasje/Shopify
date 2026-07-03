import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { loadStoredConfig, saveStoredConfig } from "../src/config-store.js";
import { createConfig } from "../src/config.js";

describe("config store", () => {
  it("saves and loads local config", async () => {
    const dir = await mkdtemp(join(tmpdir(), "ssa-config-"));
    const path = join(dir, "config.json");
    await saveStoredConfig({
      ...createConfig({
        storeUrl: "demo",
        adminAccessToken: "shpat_test"
      }),
      clientId: "client",
      grantedScopes: ["read_products"]
    }, path);

    const loaded = await loadStoredConfig(path);
    expect(loaded?.storeUrl).toBe("demo.myshopify.com");
    expect(loaded?.adminAccessToken).toBe("shpat_test");
    expect(loaded?.grantedScopes).toEqual(["read_products"]);
  });
});
