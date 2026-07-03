import { describe, expect, it } from "vitest";
import { chooseThemeWriteRoute, emptyCapabilities } from "../src/capabilities.js";

describe("capability routing", () => {
  it("prefers GraphQL theme files, then REST assets, then CLI", () => {
    expect(chooseThemeWriteRoute({ ...emptyCapabilities(), themeCli: true })).toBe("shopify-cli");
    expect(chooseThemeWriteRoute({ ...emptyCapabilities(), themeCli: true, themeRestAssets: true })).toBe("rest-assets");
    expect(chooseThemeWriteRoute({ ...emptyCapabilities(), themeGraphqlFiles: true, themeRestAssets: true, themeCli: true })).toBe("graphql-theme-files");
  });
});
