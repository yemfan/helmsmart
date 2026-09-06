import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * English copy hiding in a DATA property, one hop before it becomes JSX.
 *
 * `residualEnglish` reads JSX text — `>like this<`. It cannot see this:
 *
 *     const soloPlans = [
 *       { cta: "Start 14-day trial", tagline: "For active agents…" },
 *     ];
 *     …
 *     {plans.map((p) => <li>{p.tagline}</li>)}
 *
 * which is how the onboarding plan picker shipped every card in English on a
 * page whose heading, toggle and footer were all Chinese. Nothing was wrong
 * with the translator; the strings simply never passed through a `>` and a `<`.
 *
 * The blind spot is one level further out than the module-scope label maps
 * this suite already knows about, and it is worse, because the array usually
 * sits at module scope where `t` is not even in lexical scope — so the fix is
 * never "wrap it in t()", it is "hold keys and translate at render".
 *
 * WHY THIS IS A SHORT LIST OF KEYS. The obvious rule — "no English string
 * literal inside an array in an internationalised file" — was measured before
 * it was written: 639 hits across 161 files, mostly `title`/`description` in
 * `generateMetadata` and admin-only `label`s. A guard that cries wolf gets
 * suppressed rather than obeyed. These keys were the set where every single
 * hit was real copy on a real screen, so the rule is narrow on purpose and
 * should grow one key at a time, each time by measuring first.
 */

const ROOT = join(__dirname, "..", "..", "..");
const SCAN = ["app", "components"];

/**
 * Property names that carry copy a person reads. Deliberately excludes
 * `title` and `description` (dominated by page metadata), and `label`
 * (dominated by admin tables and chart axes) — see the note above.
 */
const COPY_KEYS = [
  "cta",
  "tagline",
  "badge",
  "blurb",
  "headline",
  "subtitle",
  "placeholder",
  "hint",
] as const;

/** Property names whose value is an array of copy — the plan-card shape. */
const LIST_KEYS = ["features", "limits", "bullets", "points", "benefits"] as const;

const KEY_STR = new RegExp(
  String.raw`(?:^|[\s{,(])(${COPY_KEYS.join("|")})\s*:\s*"([^"\\]{3,160})"`,
  "g",
);
const LIST_STR = new RegExp(
  String.raw`(?:^|[\s{,(])(${LIST_KEYS.join("|")})\s*:\s*\[([^\]]{0,4000})\]`,
  "g",
);

const EXEMPT = new Map<string, string>([
  [
    "app/financial-services/pricing/page.client.tsx",
    /*
     * A whole `PLANS` block at module scope, and `name` / `price` /
     * `priceSubtext` / `description` are English beside the keys flagged here.
     * Translating only the flagged half would leave a card in two languages,
     * which is worse than one. It is also a different product line
     * (financial-services vertical) with its own copy owner.
     */
    "Vertical pricing page: whole plan block needs converting, not four keys",
  ],
  [
    "app/loan-broker/pricing/page.client.tsx",
    "Vertical pricing page: whole plan block needs converting, not four keys",
  ],
  [
    "components/marketing/LeadSmartEditorialLanding.tsx",
    /*
     * A whole editorial landing page held as data — plan cards, feature grids,
     * testimonials — with `name`, `price`, `interval`, `desc` and `features`
     * all English beside the four keys this guard names. It is the same shape
     * as the two pricing pages above and wants the same treatment: convert the
     * block, not the keys the scan happens to see.
     */
    "Editorial landing: whole page held as data; convert the block, not four keys",
  ],
  [
    "components/marketing/voice-ai/VoiceAiComparisonTable.tsx",
    /*
     * A competitor comparison table. Every row is a claim about a named
     * third party, and a mistranslated claim about a competitor is worse than
     * an untranslated one — this needs a human who knows what was promised,
     * not a sweep.
     */
    "Competitor table: claims about named third parties, not a sweep",
  ],
  [
    "components/marketing/voice-ai/VoiceAiSampleTranscripts.tsx",
    /*
     * Sample CALL transcripts. The language of a call belongs to whoever picks
     * up, and these are shown as examples of what the AI says to a caller —
     * the same reason SalesAssistantClient is exempt in `residualEnglish`.
     */
    "Sample transcripts: the caller's language, not the dashboard's",
  ],
  [
    "components/marketing/voice-ai/VoiceAiDemoRequestForm.tsx",
    "Voice demo form: sits with the two voice-ai files above, converted together",
  ],
  [
    "app/dashboard/ai-marketing-assistant/ad-composer/AdComposerClient.tsx",
    /*
     * `EMPTY` is the starting draft of an AD the agent edits and publishes to
     * their own audience — seed content, not chrome. Whose language it should
     * be in is the agent's call about their clients, not the dashboard's, and
     * a wrong guess is a draft they have to delete before they can start.
     */
    "Ad defaults: seed content for the agent's own audience, not UI chrome",
  ],
]);

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) {
      if (name !== "node_modules" && name !== "__tests__") walk(p, out);
    } else if (p.endsWith(".tsx")) out.push(p);
  }
  return out;
}

const blankComments = (s: string) =>
  s
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "))
    .replace(/^(\s*)\/\/.*$/gm, "$1");

/**
 * Does this string literal read as copy a person sees, rather than an id,
 * a class list, a URL or a translation key?
 */
export function looksLikeCopy(value: string): boolean {
  const t = value.trim();
  if (t.length < 4) return false;
  if (!/[A-Za-z]/.test(t)) return false;
  // A translation key, a dotted path, a slug, a filename.
  if (/^[a-z0-9]+(?:[._/-][a-z0-9]+)+$/i.test(t)) return false;
  if (/^(?:https?:|\/|#|@|\.)/.test(t)) return false;
  /*
   * Tailwind class soup — "flex items-center gap-2 text-sm".
   *
   * The tell is the combination: a hyphen or colon joining tokens, nothing
   * but CSS-legal characters, and no capital anywhere. Copy that contains a
   * hyphen ("Multi-language AI day-one", "Tour requests & pre-approvals")
   * carries a capital and survives. An all-lowercase hyphenated sentence
   * would be missed; that is the deliberate trade, because the alternative
   * flags every className in the app.
   */
  if (!/[A-Z]/.test(t) && /[-:]/.test(t) && /^[a-z0-9:_[\]/.%\s-]+$/.test(t)) {
    return false;
  }
  const words = t.split(/\s+/).filter(Boolean);
  // One word is copy only if it is capitalised and long enough to be a word.
  if (words.length === 1) return /^[A-Z][a-z]{2,}$/.test(t);
  // Otherwise: at least two things that look like ordinary words.
  return words.filter((w) => /^[A-Za-z][A-Za-z'’-]*$/.test(w)).length >= 2;
}

/** Every copy-shaped string literal in `body`, with its offset. */
export function scanProps(body: string): { offset: number; where: string; text: string }[] {
  const out: { offset: number; where: string; text: string }[] = [];
  for (const m of body.matchAll(KEY_STR)) {
    if (looksLikeCopy(m[2])) out.push({ offset: m.index ?? 0, where: m[1], text: m[2] });
  }
  for (const m of body.matchAll(LIST_STR)) {
    for (const s of m[2].matchAll(/"([^"\\]{4,200})"/g)) {
      if (looksLikeCopy(s[1])) {
        out.push({ offset: m.index ?? 0, where: `${m[1]}[]`, text: s[1] });
      }
    }
  }
  return out;
}

/*
 * The scan is exported and tested here, then used below. The sibling suite
 * learned this the hard way: its scan and its self-test drifted apart, the
 * scan started matching the wrong capture group, and the whole codebase was
 * pronounced clean. One function, both callers.
 */
describe("the property scan itself", () => {
  it("finds copy on a copy-shaped key", () => {
    const found = scanProps(`
      const plans = [
        { cta: "Start free trial", tagline: "For active agents closing deals." },
      ];
    `);
    expect(found.map((f) => f.text)).toEqual([
      "Start free trial",
      "For active agents closing deals.",
    ]);
  });

  it("finds copy inside a feature list", () => {
    const found = scanProps(`features: ["Unlimited leads & contacts", "ISA workflow"],`);
    expect(found.map((f) => f.text)).toEqual([
      "Unlimited leads & contacts",
      "ISA workflow",
    ]);
  });

  it("ignores the things that made the broad rule unusable", () => {
    for (const src of [
      'cta: "pages.plans.cta"', // a translation key
      'cta: "/dashboard/credits"', // a route
      'badge: "https://example.com/x"', // a URL
      'hint: "flex items-center gap-2 text-sm"', // class soup
      'blurb: "zh-Hans"', // a locale id
      'cta: t("pages.plans.cta")', // already translated
      'headline: "Go"', // too short to be a sentence
    ]) {
      expect(scanProps(src), src).toEqual([]);
    }
  });

  it("keeps copy that merely contains a hyphen", () => {
    // "Multi-language AI (Spanish + Mandarin day-one)" is copy, not classes.
    expect(scanProps('tagline: "Multi-language AI day-one"')).toHaveLength(1);
  });

  it("does not mistake a lone lowercase identifier for a sentence", () => {
    expect(scanProps('badge: "primary"')).toEqual([]);
    expect(scanProps('badge: "Popular"')).toHaveLength(1);
  });
});

describe("English copy in data properties", () => {
  it("does not hide one hop before the JSX", () => {
    const findings: string[] = [];
    for (const root of SCAN) {
      for (const file of walk(join(ROOT, root))) {
        const src = readFileSync(file, "utf8");
        if (!/useTranslation|getServerT/.test(src)) continue;
        const rel = relative(ROOT, file).split(sep).join("/");
        if (EXEMPT.has(rel)) continue;
        const body = blankComments(src);
        const at = (o: number) => body.slice(0, o).split("\n").length;
        for (const { offset, where, text } of scanProps(body)) {
          findings.push(`${rel}:${at(offset)}  ${where}: "${text}"`);
        }
      }
    }
    expect(findings, `\n${findings.join("\n")}\n`).toEqual([]);
  });

  it("exempts only files that still exist, with a reason", () => {
    for (const [rel, reason] of EXEMPT) {
      expect(() => statSync(join(ROOT, rel)), `${rel} is exempt but missing`).not.toThrow();
      expect(reason.length, rel).toBeGreaterThan(20);
    }
  });
});
