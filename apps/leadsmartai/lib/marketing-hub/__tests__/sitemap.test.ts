import { describe, expect, it } from "vitest";
import { normalizeHubConfig } from "../config";
import { hubSitemapPaths } from "../sitemapPaths";

const bio = "A bio long enough to clear the forty-character bar for indexing.";

describe("hubSitemapPaths", () => {
  it("lists nothing for a hub that would be noindex", () => {
    expect(hubSitemapPaths({ username: "m", config: normalizeHubConfig({}), hasSavedConfig: false, serviceAreas: [], feedCount: 1, bio })).toEqual([]);
    expect(hubSitemapPaths({ username: "m", config: normalizeHubConfig({}), hasSavedConfig: false, serviceAreas: [], feedCount: 5, bio: null })).toEqual([]);
    expect(
      hubSitemapPaths({ username: "m", config: normalizeHubConfig({ seo: { noindex: true } }), hasSavedConfig: true, serviceAreas: [], feedCount: 5, bio }),
    ).toEqual([]);
  });

  it("lists the home page, existing subpages and area pages in the pages layout", () => {
    const paths = hubSitemapPaths({
      username: "m",
      config: normalizeHubConfig({ areas: { items: [{ name: "Alhambra, CA" }] } }),
      hasSavedConfig: false,
      serviceAreas: [],
      feedCount: 5,
      bio,
    }).map((e) => e.path);
    expect(paths).toEqual(["/@m", "/@m/about", "/@m/services", "/@m/tools", "/@m/areas", "/@m/posts", "/@m/contact", "/@m/area/alhambra-ca"]);
  });

  it("lists only the home page and areas in the single layout", () => {
    const paths = hubSitemapPaths({
      username: "m",
      config: normalizeHubConfig({ appearance: { layout: "single" } }),
      hasSavedConfig: false,
      serviceAreas: ["Arcadia, CA"],
      feedCount: 3,
      bio,
    }).map((e) => e.path);
    expect(paths).toEqual(["/@m", "/@m/area/arcadia-ca"]);
  });
});
