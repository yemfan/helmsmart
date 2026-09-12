import { describe, expect, it } from "vitest";

import {
  EMPTY_PROFILE,
  isEmptyProfile,
  mergeProfile,
  parseProfile,
  renderProfile,
  type BusinessProfile,
} from "@/lib/business-profile";

/**
 * The knowledge_base mirror is not a nicety — on the Core project it is the
 * ONLY place the business profile is stored, because migrations 00085/00086
 * have not been applied there and all four columns answer 42703. So the guided
 * setup, the draft and the /home checklist read the profile back out of this
 * text. A round trip that loses the website is a setup step with nothing to
 * work from, which is the exact bug this whole change exists to fix.
 */

const FULL: BusinessProfile = {
  website: "https://acme.com",
  category: "Plumbing",
  location: "Austin, TX",
  description: "We fix boilers and clear drains.\nSame-day service most days.",
};

describe("the profile round-trips through the mirror", () => {
  it("keeps every field", () => {
    expect(parseProfile(renderProfile(FULL))).toEqual(FULL);
  });

  it("keeps the website, which the old mirror dropped entirely", () => {
    expect(renderProfile(FULL)).toContain("Website: https://acme.com");
    expect(parseProfile(renderProfile(FULL)).website).toBe("https://acme.com");
  });

  it("survives a profile with only one field", () => {
    for (const key of ["website", "category", "location", "description"] as const) {
      const one = { ...EMPTY_PROFILE, [key]: key === "website" ? "https://a.com" : "something" };
      expect(parseProfile(renderProfile(one)), key).toEqual(one);
    }
  });

  it("reads back the lines createOrg has always written, without a Website line", () => {
    // Every org created before this branch has a mirror in exactly this shape.
    const legacy = "Category: Plumbing.\nBased in Austin, TX.\nWe fix boilers.";
    expect(parseProfile(legacy)).toEqual({
      website: "",
      category: "Plumbing",
      location: "Austin, TX",
      description: "We fix boilers.",
    });
  });
});

describe("parseProfile is forgiving, because owners edit this entry", () => {
  it("treats unrecognised prose as the description", () => {
    expect(parseProfile("We are a family firm.\nWe have been going since 1994.")).toEqual({
      ...EMPTY_PROFILE,
      description: "We are a family firm.\nWe have been going since 1994.",
    });
  });

  it("is empty for nothing at all", () => {
    expect(parseProfile(null)).toEqual(EMPTY_PROFILE);
    expect(parseProfile("")).toEqual(EMPTY_PROFILE);
    expect(parseProfile("   \n\n  ")).toEqual(EMPTY_PROFILE);
  });

  it("takes the first of a repeated label and keeps the rest as prose", () => {
    const p = parseProfile("Category: Plumbing.\nCategory: also HVAC.");
    expect(p.category).toBe("Plumbing");
    expect(p.description).toContain("also HVAC");
  });
});

describe("mergeProfile", () => {
  it("prefers the column, which is the record", () => {
    const merged = mergeProfile({ category: "Dentistry" }, FULL);
    expect(merged.category).toBe("Dentistry");
    // …and fills the rest from the mirror, which is where they live today.
    expect(merged.website).toBe("https://acme.com");
    expect(merged.location).toBe("Austin, TX");
  });

  it("falls entirely back to the mirror when there are no columns at all", () => {
    expect(mergeProfile(null, FULL)).toEqual(FULL);
  });

  it("does not let a blank column blank a real mirror value", () => {
    expect(mergeProfile({ website: "   " }, FULL).website).toBe("https://acme.com");
  });
});

describe("isEmptyProfile", () => {
  it("is true only when there is genuinely nothing to save", () => {
    expect(isEmptyProfile(EMPTY_PROFILE)).toBe(true);
    expect(isEmptyProfile({ ...EMPTY_PROFILE, website: "  " })).toBe(true);
    expect(isEmptyProfile({ ...EMPTY_PROFILE, category: "Plumbing" })).toBe(false);
  });
});
