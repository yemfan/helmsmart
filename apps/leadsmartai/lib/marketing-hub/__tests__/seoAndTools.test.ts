import { describe, expect, it } from "vitest";
import { hubDescription, hubTitle, realEstateAgentJsonLd } from "../seo";
import { hubToolHref, resolveHubTools } from "../tools";

describe("realEstateAgentJsonLd", () => {
  it("emits only what is known", () => {
    const node = realEstateAgentJsonLd({
      name: "Michael Ye",
      url: "https://www.closebossai.com/@michaelye",
      description: null,
      imageUrl: null,
      phone: null,
      email: null,
      brokerage: null,
      jobTitle: null,
      areas: [],
      sameAs: [],
      languages: [],
    });
    expect(node).toEqual({
      "@context": "https://schema.org",
      "@type": "RealEstateAgent",
      name: "Michael Ye",
      url: "https://www.closebossai.com/@michaelye",
    });
    // No invented ratings, reviews or hours — ever.
    expect(node).not.toHaveProperty("aggregateRating");
  });

  it("maps areas and brokerage when present", () => {
    const node = realEstateAgentJsonLd({
      name: "M",
      url: "u",
      description: "d",
      imageUrl: "i",
      phone: "p",
      email: "e",
      brokerage: "B",
      jobTitle: "Advisor",
      areas: ["Alhambra"],
      sameAs: ["https://instagram.com/m"],
      languages: ["English"],
    });
    expect(node.areaServed).toEqual([{ "@type": "Place", name: "Alhambra" }]);
    expect(node.memberOf).toEqual({ "@type": "Organization", name: "B" });
  });
});

describe("title and description", () => {
  it("prefers the agent's own SEO copy, then derives", () => {
    expect(hubTitle({ seoTitle: "Own", name: "M", brandName: null, location: null })).toBe("Own");
    expect(hubTitle({ seoTitle: null, name: "M", brandName: "M", location: "LA" })).toBe("M · LA");
    expect(hubDescription({ seoDescription: null, bio: "  Hi   there ", name: "M", brandName: null, location: null })).toBe(
      "Hi there",
    );
  });
});

describe("tools", () => {
  it("resolves keys in order, dropping unknowns and duplicates", () => {
    const tools = resolveHubTools(["mortgage", "nope", "home_value", "mortgage"]);
    expect(tools.map((t) => t.key)).toEqual(["mortgage", "home_value"]);
  });

  it("substitutes the handle into hub-owned hrefs", () => {
    const [hv] = resolveHubTools(["home_value"]);
    expect(hubToolHref(hv, "michaelye")).toBe("/@michaelye/home-value");
  });
});
