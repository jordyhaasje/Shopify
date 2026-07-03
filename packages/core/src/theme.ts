import { chooseThemeWriteRoute, ThemeWriteRoute } from "./capabilities.js";
import { CapabilitySnapshot } from "./config.js";

export interface ThemeSectionPlan {
  name: string;
  referenceUrl?: string;
  route: ThemeWriteRoute;
  files: string[];
  requiresPreview: true;
}

export function planThemeSection(input: {
  name: string;
  referenceUrl?: string;
  capabilities?: CapabilitySnapshot;
}): ThemeSectionPlan {
  const slug = input.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  return {
    name: input.name,
    referenceUrl: input.referenceUrl,
    route: chooseThemeWriteRoute(input.capabilities),
    files: [`sections/${slug || "ai-section"}.liquid`],
    requiresPreview: true
  };
}

export function assertThemeApplyAllowed(previewId: string | undefined, confirmed: boolean): void {
  if (!previewId) throw new Error("Theme apply requires a preview ID.");
  if (!confirmed) throw new Error("Theme apply requires explicit confirmation.");
}
