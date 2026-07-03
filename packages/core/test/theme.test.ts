import { describe, expect, it } from "vitest";
import { emptyCapabilities } from "../src/capabilities.js";
import { assertThemeApplyAllowed, planThemeSection } from "../src/theme.js";

describe("theme workflow", () => {
  it("plans a section with the best available route", () => {
    const plan = planThemeSection({
      name: "Hero Banner",
      referenceUrl: "https://example.com",
      capabilities: { ...emptyCapabilities(), themeRestAssets: true }
    });

    expect(plan.files).toEqual(["sections/hero-banner.liquid"]);
    expect(plan.route).toBe("rest-assets");
    expect(plan.requiresPreview).toBe(true);
  });

  it("blocks apply without preview confirmation", () => {
    expect(() => assertThemeApplyAllowed(undefined, true)).toThrow("preview ID");
    expect(() => assertThemeApplyAllowed("preview-1", false)).toThrow("confirmation");
  });
});
