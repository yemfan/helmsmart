import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * The product is light. A page that isn't looks broken, not styled.
 *
 * The signup funnel — eight screens, and where the landing page's own primary
 * CTA points — was near-black while every other page was light. A brokerage
 * manager's first look at CloseBoss was the one page that didn't look like
 * CloseBoss. Nothing failed: the page rendered, the tests passed, the types
 * checked. It was simply the wrong colour, and only a person opening it could
 * tell.
 *
 * So this guard reads backgrounds the way a visitor does — full-screen page
 * shells only. A dark *panel* is a legitimate design element (a terminal, a
 * toast, a high-contrast conversion block) and is deliberately not in scope
 * here; what is in scope is a whole page arriving in the wrong theme.
 */

const ROOT = join(__dirname, "..", "..", "..");

/** Full-screen shells painted a near-black. */
const DARK_SHELL =
  /min-h-screen[^"'`]*(?:bg-(?:slate|gray|neutral|zinc)-9\d0|bg-black|from-(?:slate|gray|neutral|zinc)-9\d0)/;

/**
 * Surfaces that are deliberately dark, with the reason they earn it.
 *
 * The open-house kiosk is not a page anyone browses to — it is a tablet on a
 * stand in a stranger's living room, where a dark high-contrast screen is the
 * correct choice and a white one glares. Different medium, different rules.
 */
const INTENTIONALLY_DARK = ["app/oh/[slug]/kiosk/KioskClient.tsx"];

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (entry === "node_modules" || entry === ".next") continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (entry.endsWith(".tsx")) out.push(full);
  }
  return out;
}

describe("page theme", () => {
  it("has no dark full-screen page shell outside the kiosk", () => {
    const offenders: string[] = [];
    for (const dir of ["app", "components"]) {
      for (const file of walk(join(ROOT, dir))) {
        const rel = relative(ROOT, file).split("\\").join("/");
        if (INTENTIONALLY_DARK.includes(rel)) continue;
        const src = readFileSync(file, "utf8");
        // `dark:bg-slate-900` is a dark-MODE variant, not a dark page.
        for (const line of src.split("\n")) {
          const stripped = line.replace(/dark:[^\s"'`]+/g, "");
          if (DARK_SHELL.test(stripped)) offenders.push(`${rel}: ${line.trim().slice(0, 90)}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  it("paints the onboarding skeleton the same colour as the funnel it becomes", () => {
    /*
     * These two files are the same shell drawn twice — one while the client
     * component hydrates, one after. When only the funnel was converted, the
     * page opened navy and flashed to white a moment later, which reads as a
     * glitch on the very first screen a prospect sees.
     */
    const funnel = readFileSync(
      join(ROOT, "components", "onboarding", "OnboardingFunnel.tsx"),
      "utf8",
    );
    const skeleton = readFileSync(join(ROOT, "app", "onboarding", "loading.tsx"), "utf8");
    for (const [name, src] of [
      ["funnel", funnel],
      ["skeleton", skeleton],
    ] as const) {
      expect(src, `${name} should use the site's light ground`).toContain(
        "min-h-screen bg-gray-50",
      );
    }
  });

  it("keeps the funnel's own wordmark drawn for a light background", () => {
    // `tone="dark"` means "drawn FOR a dark background" — it paints the
    // wordmark white. On the light funnel that is an invisible logo, which is
    // exactly how it shipped for the length of one dark theme.
    const funnel = readFileSync(
      join(ROOT, "components", "onboarding", "OnboardingFunnel.tsx"),
      "utf8",
    );
    expect(funnel).not.toMatch(/<CloseBossLogo[^>]*tone="dark"/);
  });
});
