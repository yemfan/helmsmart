import { readFileSync, readdirSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

import { ROOT } from "./bundles";

/**
 * Every route a person can open is either internationalised, or listed here
 * with a reason.
 *
 * THE GAP THIS CLOSES. Every other guard in this directory opens with the same
 * line:
 *
 *     if (!/useTranslation|getServerT/.test(src)) continue;
 *
 * That gate is what let the app adopt i18n a page at a time — a file is held
 * to the standard only once it opts in, so a half-finished surface fails
 * loudly instead of blocking the rest. The cost is that a file which NEVER
 * opts in is invisible to all of them. "All guards green" then means "no
 * English in the files that opted in", which is not the same claim at all, and
 * reads exactly like the stronger one.
 *
 * It was not hypothetical. An audit of the shipped app found four public pages
 * that call no translator: the team-invitation page, the invoice payment page,
 * the client portal and the appointment rescheduler. Fetched from a production
 * build with a Spanish cookie, the invitation page rendered "Invalid
 * invitation" and "This invitation link is invalid or has been revoked." in
 * English, directly under a Spanish skip-link — so the locale had resolved
 * perfectly and the page simply had nothing to say in it. The invitation
 * EMAIL that leads there was already translated, which made the seam worse:
 * Spanish mail, English landing page.
 *
 * So this guard inverts the gate. Instead of asking "is this opted-in file
 * clean?", it asks "is there a route that never opted in?", and requires an
 * explicit exemption with a stated reason. Adding a page that renders copy and
 * forgetting to translate it now fails here, at the moment it is added,
 * instead of surviving until someone reads the app in another language.
 */

const APP = join(ROOT, "app");

/** A file that renders something a person reads. */
const RENDERS_UI = /\.tsx$/;

/**
 * Routes that legitimately have no copy of their own, each with the reason.
 *
 * A path earns a place here by rendering NOTHING a reader reads — a redirect,
 * a pure layout, a wrapper whose text all lives in a child component. It does
 * NOT earn one by being inconvenient to translate. If a file shows a sentence,
 * it belongs in a bundle.
 */
const EXEMPT: Record<string, string> = {
  // The invoice's print button sat here on "the page is its own <html>
  // document, so there is no I18nProvider to hook". Only the first half was
  // true, and it was the bug: every route is under the root layout, so the
  // nested <html> rendered blank instead. The page now renders inside the
  // layout (`app/(documents)`), and the button reads the provider like any
  // other client component.
  // `app/(auth)/layout.tsx` used to sit here on "no sentences". It had one — the
  // pack tagline — rendered from a TS constant, so it read as English under a
  // Chinese login form on every auth screen. The rule above was right; this
  // record of the file was wrong. It translates now and is no longer exempt.
  "app/(dashboard)/layout.tsx":
    "composes the sidebar, bell and AI panel; every string belongs to those components",
  "app/(onboarding)/layout.tsx": "renders the brand wordmark and a slot; no sentences",
  "app/(dashboard)/reception/page.tsx": "a bare redirect() to /voice, kept so old links land",
  /*
   * The printable invoice used to sit here as "deliberately English — the
   * CUSTOMER receives it". The design doc says the opposite: a document the
   * contact receives follows THEIR language. It now renders in the client's
   * `preferred_language`, and its toolbar in the owner's, so neither file is
   * exempt any more.
   */
  "app/(onboarding)/onboarding/page.tsx":
    "auth gate and redirect only; every string is inside components/onboarding-form.tsx, which is translated",
  "app/(marketing)/_rich.tsx":
    "a rendering mechanism, not a surface — it interpolates markers inside an already-translated string; see its own header",
};

/** Route files under app/, relative to the app root, POSIX-separated. */
function routeFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      // API handlers answer machines, not readers.
      if (entry.name === "api") continue;
      routeFiles(full, out);
    } else if (RENDERS_UI.test(entry.name)) {
      out.push(relative(ROOT, full).split("\\").join("/"));
    }
  }
  return out;
}

/**
 * Does this file actually CALL a translator?
 *
 * Comments are stripped first, and the name must be followed by `(`. Both
 * matter, in opposite directions.
 *
 * The other guards in this directory grep the raw source for the same names,
 * which is safe for them: a stray mention in a comment only pulls a file in
 * for MORE scrutiny. Here the polarity is reversed — a match EXEMPTS a file
 * from the one check that would notice it renders untranslated copy. So a
 * sentence like "this panel does not use useTranslation" would silently
 * whitelist the very file it is describing.
 *
 * That is not hypothetical either: writing exactly such a comment during this
 * work turned three other guards red, which is how the asymmetry surfaced.
 */
function speaks(file: string): boolean {
  const src = readFileSync(join(ROOT, file), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, " ") // block comments, JSDoc included
    .replace(/\/\/.*/g, " "); // line comments
  return /\b(useTranslation|getServerT|translatorFor)\s*\(/.test(src);
}

describe("route coverage", () => {
  it("finds a plausible number of route files", () => {
    // The walker is load-bearing: if it stops matching, the assertion below
    // passes over an empty list and this guard goes green while routes rot.
    const files = routeFiles(APP);
    expect(files.length).toBeGreaterThan(80);
    expect(files).toContain("app/layout.tsx");
  });

  it("has no route that renders copy without a translator", () => {
    const silent = routeFiles(APP)
      .filter((f) => !speaks(f))
      .filter((f) => !(f in EXEMPT));

    expect(
      silent,
      `\nThese route files call no translator, so every other guard in this\n` +
        `directory skips them entirely and cannot see English inside them:\n\n` +
        `${silent.join("\n")}\n\n` +
        `Translate the file, or add it to EXEMPT with the reason it has no copy.\n`,
    ).toEqual([]);
  });

  it("keeps the exemption list honest", () => {
    // An exemption for a file that no longer exists is a comment pretending to
    // be a rule, and it hides the next real gap behind a stale name.
    const files = new Set(routeFiles(APP));
    const stale = Object.keys(EXEMPT).filter((f) => !files.has(f));
    expect(stale, `\nEXEMPT names files that no longer exist:\n${stale.join("\n")}\n`).toEqual([]);

    // And an exemption that has quietly started translating should be dropped,
    // so the list shrinks as the app improves rather than growing forever.
    const nowSpeaks = Object.keys(EXEMPT).filter((f) => files.has(f) && speaks(f));
    expect(
      nowSpeaks,
      `\nThese are exempt but now call a translator — remove them from EXEMPT:\n${nowSpeaks.join("\n")}\n`,
    ).toEqual([]);
  });
});
