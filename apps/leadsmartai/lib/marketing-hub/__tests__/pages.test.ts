import { describe, expect, it } from "vitest";
import { defaultHubConfig, normalizeHubConfig } from "../config";
import { availablePages, sectionHref, type HubPageFacts } from "../pages";

function facts(over: Partial<HubPageFacts> = {}): HubPageFacts {
  return {
    config: defaultHubConfig(),
    hasSavedConfig: false,
    areaCount: 2,
    feedCount: 3,
    hasAbout: true,
    ...over,
  };
}

describe("availablePages", () => {
  it("offers every page for a full hub", () => {
    expect(availablePages(facts())).toEqual(["about", "services", "tools", "areas", "posts", "contact"]);
  });

  it("drops pages that would be empty", () => {
    const cfg = normalizeHubConfig({ services: { enabled: false }, leadCapture: { showForm: false } });
    expect(availablePages(facts({ config: cfg, feedCount: 0, areaCount: 0, hasAbout: false }))).toEqual(["tools"]);
  });

  it("respects an explicitly emptied service list", () => {
    expect(availablePages(facts({ hasSavedConfig: true }))).not.toContain("services");
  });
});

describe("sectionHref", () => {
  it("links to pages in the pages layout and anchors in the single layout", () => {
    expect(sectionHref("m", "services", "pages")).toBe("/@m/services");
    expect(sectionHref("m", "services", "single", { fromHome: true })).toBe("#services");
    expect(sectionHref("m", "services", "single")).toBe("/@m#services");
  });

  it("keeps the assistant on the home page in both layouts", () => {
    expect(sectionHref("m", "assistant", "pages")).toBe("/@m#assistant");
    expect(sectionHref("m", "assistant", "pages", { fromHome: true })).toBe("#assistant");
    expect(sectionHref("m", "home", "pages")).toBe("/@m");
  });
});
