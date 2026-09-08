import { describe, expect, it } from "vitest";
import { normalizeBrand, parseBrandInput } from "../brand";

describe("normalizeBrand", () => {
  it("trims, keeps only http(s) urls, and is null when nothing would show", () => {
    expect(normalizeBrand({ name: "  Golden Gate Realty ", logoUrl: "https://x/logo.png", website: "golden.example", license: " 01234567 ", disclosure: "" })).toEqual({
      name: "Golden Gate Realty",
      logoUrl: "https://x/logo.png",
      website: null,
      license: "01234567",
      disclosure: null,
    });
    expect(normalizeBrand({})).toBeNull();
    expect(normalizeBrand(null)).toBeNull();
    expect(normalizeBrand({ name: "   " })).toBeNull();
  });
});

describe("parseBrandInput", () => {
  it("names the field that failed", () => {
    const long = "x".repeat(2000);
    const r = parseBrandInput({ name: "A", disclosure: long });
    expect(r).toEqual({ ok: false, field: "disclosure" });
  });
  it("returns null for an emptied form, so clearing the card clears the brand", () => {
    expect(parseBrandInput({ name: "", logoUrl: "", website: "", license: "", disclosure: "" })).toEqual({ ok: true, brand: null });
  });
});
