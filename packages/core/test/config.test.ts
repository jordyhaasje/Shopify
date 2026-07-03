import { describe, expect, it } from "vitest";
import { createConfig, redactConfig } from "../src/config.js";

describe("config", () => {
  it("normalizes store urls and redacts secrets", () => {
    const config = createConfig({
      storeUrl: "demo",
      adminAccessToken: "shpat_1234567890",
      themeAccessToken: "theme_abcdefghi"
    });

    expect(config.storeUrl).toBe("demo.myshopify.com");
    expect(redactConfig(config).adminAccessToken).toBe("shpa...7890");
    expect(redactConfig(config).themeAccessToken).toBe("them...fghi");
  });
});
