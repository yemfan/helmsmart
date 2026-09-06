import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { detectPlatform } from "@/lib/listingUrl";

/**
 * A link is a link even when we do not recognise the site.
 *
 * "Look up the property" branched on whether the URL was a platform we
 * support, not on whether it was a URL at all. So a listing on any other site
 * fell through to the ADDRESS lookup with the whole URL passed as an address.
 * The warehouse fuzzy-matched the slug — ".../3231405570538161286-931-hampton"
 * — to a real property and filled city, ZIP, price and specs correctly, which
 * is what made it look like it had worked. Property address was left holding
 *
 *     https://1pinnacle.com/home-search/listings/3231405570538161286-931-hampton
 *
 * and that is what the transaction would have saved: a record whose address is
 * a URL, feeding every downstream surface that prints an address — the
 * Facebook caption included.
 */
const ROOT = join(__dirname, "..", "..", "..");
const read = (rel: string) => readFileSync(join(ROOT, rel), "utf8");

const FIELD = "components/dashboard/PropertyLookupField.tsx";

describe("property lookup: links vs addresses", () => {
  it("does not recognise every listing host, which is the case that broke", () => {
    // The premise of the bug. If this ever returns a platform, the dispatch
    // below stops being the thing under test.
    expect(detectPlatform("https://1pinnacle.com/home-search/listings/123-931-hampton")).toBeNull();
    expect(detectPlatform("https://www.zillow.com/homedetails/x/123_zpid/")).toBe("zillow");
  });

  it("sends anything URL-shaped to the listing reader, not the address lookup", () => {
    const src = read(FIELD);
    expect(src).toMatch(/const looksLikeUrl = \/\^https\?:/);
    expect(src).toMatch(/looksLikeUrl \? await fromListingUrl\(raw\) : await fromAddress\(raw\)/);
    // The old branch is what routed an unknown host into the address path.
    expect(src).not.toMatch(/platform \? await fromListingUrl\(raw\)/);
  });

  it("never lets the raw query become the address when it is a link", () => {
    /*
     * `str(p.address) ?? address` was the second half: a warehouse row with no
     * address of its own fell back to whatever was typed. Harmless for a typed
     * address, and how the URL landed in the field for a pasted link.
     */
    const src = read(FIELD);
    expect(src).toMatch(/address: str\(p\.address\) \?\? \(\/\^https\?:/);
  });

  it("says which sites do work instead of failing vaguely", () => {
    // The endpoint answers 400 "Unsupported URL. Use zillow.com, redfin.com,
    // realtor.com, or compass.com" — worth showing, since pasting the address
    // instead always works.
    const src = read(FIELD);
    expect(src).toContain("pages.propertyLookup.unsupportedSite");
    for (const loc of ["en", "zh-Hans"]) {
      const dict = JSON.parse(
        readFileSync(join(ROOT, "..", "..", "packages", "i18n", "locales", loc, "dashboard.json"), "utf8"),
      );
      expect(dict.pages.propertyLookup.unsupportedSite, `${loc} missing the string`).toBeTruthy();
    }
  });
});
