import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * A tooltip on a disabled button is an explanation nobody can read.
 *
 * The listing ad panel had five gated controls, and every one of them put its
 * reason in `title=`: "Paste a listing URL first", "Add at least one photo",
 * "Build the ad first". A disabled element receives no mouse events, so the
 * browser never opens that tooltip — five explanations were written and not
 * one of them has ever reached a user. What the agent saw was a faded button
 * and nothing else, on a panel where four of the five steps are gated behind
 * the step before them.
 *
 * The reason is rendered beside the button now. This guards the property that
 * matters — a reason worth writing is a reason worth showing — rather than
 * the markup, so a sixth gated button cannot quietly repeat it.
 */
const PANEL = join(__dirname, "..", "..", "..", "components", "listings", "ListingAdPanel.tsx");
const src = readFileSync(PANEL, "utf8");

/** Each gate: the expression the button disables on, and the key it explains. */
const GATES: Array<[unmet: string, key: string]> = [
  ["!pullUrl.trim()", "pages.listingAd.pullNeedsUrl"],
  ["photosToAnimate.length === 0", "pages.listingAd.needPhoto"],
  ["clipUrls.length === 0", "pages.listingAd.needClips"],
  ["!reelUrl", "pages.listingAd.needAdFirst"],
  ["!script.trim()", "pages.listingAd.needScript"],
];

describe("listing ad panel: gated buttons", () => {
  it.each(GATES)("shows why it is disabled when %s", (unmet, key) => {
    // Off the same expression the button gates on — a hand-copied condition
    // is how a button ends up grey for a reason the hint does not mention.
    expect(src).toContain(`<GateReason reason={${unmet} ? t("${key}") : null} />`);
    // And it is still the button's real condition, not a stale copy.
    expect(src, `${key}: nothing gates on ${unmet} any more`).toContain(`|| ${unmet}}`);
  });

  it("leaves no reason reachable only by hovering a disabled button", () => {
    /*
     * The invariant, not the markup: any string this file offers as a tooltip
     * for an unmet precondition must also be rendered on the page. A sixth
     * button added with `title={x ? t("needsFoo") : ...}` and no GateReason
     * fails here.
     */
    const tooltipKeys = [...src.matchAll(/title=\{[^}]*\bt\("(pages\.listingAd\.(?:need|pull)[A-Za-z]+)"\)/g)]
      .map((m) => m[1]);
    expect(tooltipKeys.length, "no gated tooltips found — did the panel change shape?").toBeGreaterThan(0);
    const unreachable = [...new Set(tooltipKeys)].filter((k) => !src.includes(`<GateReason reason={`) || !src.includes(`t("${k}") : null} />`));
    expect(unreachable).toEqual([]);
  });

  it("keeps the copy translated", () => {
    const dict = (locale: string) =>
      JSON.parse(
        readFileSync(
          join(__dirname, "..", "..", "..", "..", "..", "packages", "i18n", "locales", locale, "dashboard.json"),
          "utf8",
        ),
      ).pages.listingAd;
    for (const [, key] of GATES) {
      const leaf = key.split(".").pop() as string;
      for (const locale of ["en", "zh-Hans"]) {
        expect(dict(locale)[leaf], `${locale} missing ${leaf}`).toBeTruthy();
      }
    }
  });
});
