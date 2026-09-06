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

/**
 * The same trap, on the panels the listing panel was not the only one to set.
 *
 * `title=` on a disabled button is the house habit, and these four reasons —
 * two of them never translated — were written the same way and were just as
 * unreachable. The component is shared now so the next one has somewhere to
 * go that is not a tooltip.
 */
const APP = join(__dirname, "..", "..", "..");
const ELSEWHERE: Array<[file: string, unmet: string, key: string]> = [
  ["components/account/DigitalTwinPanel.tsx", "!consent", "twin.consentFirst"],
  ["components/account/DigitalTwinPanel.tsx", "!vc?.consent", "twin.cloneVoiceTitle"],
  ["components/dashboard/ListingFeedbackPanel.tsx", "!row.buyer_agent_email", "pages.listingFeedback.needBuyerAgentEmail"],
  ["components/dashboard/PlaybooksPanel.tsx", "selectedIds.size === 0", "pages.playbooksPanel.needSelection"],
];

describe("the other panels that hid their reasons", () => {
  it("does not repeat a reason a panel already says out loud", () => {
    /*
     * Two of the digital twin's gates were already answered on screen: the
     * render button has its own hint ("Hit Preview voice (free) first…"),
     * written with a comment saying a disabled button with only a tooltip
     * reads as broken, and twin.buildFirst covers the missing intro video.
     * A second sentence beside the button is noise, not discoverability.
     */
    const twin = readFileSync(join(APP, "components/account/DigitalTwinPanel.tsx"), "utf8");
    expect(twin).not.toContain('<GateReason reason={!avAudioPath');
    expect(twin).not.toContain('t("twin.recordFirst") : null} />');
    // The hints that made them redundant have to still be there.
    expect(twin).toContain('t("pages.digitalTwin.hitPreviewVoiceFree")');
    expect(twin).toContain('t("twin.buildFirst")');
  });

  it.each(ELSEWHERE)("%s explains %s", (file, unmet, key) => {
    const text = readFileSync(join(APP, file), "utf8");
    expect(text, `${file} should import the shared component`).toContain(
      'import { GateReason } from "@/components/ui/GateReason";',
    );
    expect(text).toContain(`<GateReason reason={${unmet} ?`);
    expect(text).toContain(`t("${key}")`);
  });

  it("leaves no English literal behind in the tooltips it replaced", () => {
    // Two of these reasons were hardcoded English on a translated page, so
    // the half of the audience reading Chinese got an unreachable tooltip in
    // a language they had not asked for.
    for (const rel of ["components/dashboard/ListingFeedbackPanel.tsx", "components/dashboard/PlaybooksPanel.tsx"]) {
      const text = readFileSync(join(APP, rel), "utf8");
      expect(text, rel).not.toContain("Add buyer-agent email to enable");
      expect(text, rel).not.toContain("Tick the box on any open playbook item to enable");
    }
  });

  it("keeps one GateReason, not a copy per panel", () => {
    // A second definition is how the two drift into different sizes, colours
    // and rules about when a reason shows at all.
    const shared = readFileSync(join(APP, "components", "ui", "GateReason.tsx"), "utf8");
    expect(shared).toContain("export function GateReason");
    for (const [file] of ELSEWHERE) {
      expect(readFileSync(join(APP, file), "utf8")).not.toContain("function GateReason(");
    }
    expect(readFileSync(PANEL, "utf8")).not.toContain("function GateReason(");
  });
});
