import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * "This page is translated" turned out to be a weaker claim than it sounds.
 * Every file below passes the `useTranslation` check, and 46 English strings
 * were still rendering from them — headings, form labels, tooltips, and a
 * module-scope JSX constant in the sidebar itself.
 *
 * The check covers JSX text nodes and copy-carrying attributes. It has been
 * widened five times, each time after the narrower version reported a page
 * clean that was still visibly English:
 *
 *   - one-word copy (Save, Cancel, Done) — 42 strings the two-word rule hid;
 *   - text nodes wrapped across source lines — 285 strings, because a
 *     paragraph long enough to wrap is a paragraph long enough to matter.
 *     Help text and explainers are almost all of it;
 *   - text nodes adjacent to an interpolation — 390 strings, and the worst of
 *     the three. A sentence with a `{value}` in the middle is two text nodes,
 *     and only the half between two tags was ever checked, so the pages that
 *     failed were the ones that say something specific to the reader;
 *   - copy that does not open with a letter — 47 strings across 24 files. The
 *     anchor was `[A-Za-z]`, so a numbered step ("1. Understand net operating
 *     income (NOI)"), a span of hours ("24/7 — no payroll, benefits, or
 *     turnover") and a sublabel ("7+ days inactive") were all invisible. Every
 *     how-to guide on this site numbers its steps, so each article's headings
 *     were exempt by accident while the paragraphs between them were checked,
 *     which is the half-Chinese page again in a different costume;
 *   - the `sub` prop — 3 strings, every one of them a KpiTile sublabel. A
 *     small number for a hole with no floor: `sub` was missing from
 *     COPY_ATTRS only because it is spelled shorter than `sublabel`, and any
 *     component that names its sublabel that way inherited the blind spot.
 *
 * The cost of widening is false positives, so each widening is paid for by a
 * specific guard: capitalisation for single words, a `[^=]` lookbehind for
 * arrow functions, rejection of cast tails, resumed statements and calls once
 * a `}` can open a match, and rejection of a numeric literal resuming a
 * statement once a digit can. The example addresses the digit anchor also
 * surfaced are named in ALLOWED, for the same reason the company's postal
 * address is. A scan that cries wolf gets ignored, and then it protects
 * nothing.
 */

const ROOT = join(__dirname, "..", "..", "..");
const SCAN = ["app", "components"];

/**
 * Proper nouns that are correct as-is in every language — plus the company's
 * postal address, which has to stay in the form the US post office reads no
 * matter who is looking at the page.
 */
const ALLOWED = new Set([
  "MAXY Investment Inc.",
  "6511 Parkriver Crossing",
  "Sugar Land, TX 77479",
  "United States",
  "CloseBoss",
  "CloseBoss AI",
  // Competitor product names, in a comparison table that names them.
  "AgencyBloc / Redtail CRM",
  "Salesforce Financial Services Cloud",
  "Pinterest",
  "TikTok",
  "YouTube",
  "Pro",
  "Premium",
  "Elite",
  "Signature",
  "Team",
  "PDF",
  // A channel badge, sitting next to the "@" that marks the email one. The
  // acronym is what a Chinese-speaking agent reads on their own phone too.
  "SMS",
  // The key cap, not a word: it is printed on the keyboard the same way here.
  "Esc",
  // Max is an AI employee on the team, not the adjective.
  "Max",
  /*
   * A byline: the post's publication date and its author. The articles
   * themselves are written in English, so a Chinese byline over English
   * prose would be the mixed-language page this scan exists to prevent,
   * pointing the wrong way.
   */
  "May 22, 2026 · Michael Ye",
  "May 23, 2026 · Michael Ye",
  "June 23, 2026 · Michael Ye",
  // A person, their brokerage and their city — three proper nouns.
  "Mara Tran · Windermere · Seattle",
  /*
   * Example addresses in address fields. Same reasoning as the postal address
   * above: the placeholder shows the reader the SHAPE the field wants, and the
   * field is read by a US address geocoder. "洛杉矶主街 123 号" is the correct
   * Chinese for those words and the wrong thing to type into the box.
   */
  "123 Main St, Los Angeles, CA",
  "123 Main St Los Angeles CA",
  "123 Main St, Austin, TX 78701",
  "123 Main St, City, State",
  "456 Oak Ave, City",
]);

/**
 * Attributes a PERSON reads.
 *
 * The second half of this list is the one that matters. `sublabel`, `hint`,
 * `description` and friends are not HTML attributes — they are props on our own
 * components, and every scan here was blind to them. A QA pass found the
 * approval-policy setting explained only in English:
 *
 *     sublabel="Safer. Every triggered message becomes a draft…"
 *
 * That is the control deciding whether an agent's AI texts their clients
 * unsupervised, and the sentence explaining the choice was in a language the
 * reader may not have. 70 strings across 36 files were hiding in this shape.
 *
 * A prop is on this list when its value is read by a human. `variant`, `size`,
 * `icon` and `href` are read by the browser and stay off it. `sub` is the same
 * prop as `sublabel` with a shorter name — the KpiTile row on the demo
 * dashboard uses it — so the two live or die together.
 */
const COPY_ATTRS =
  /\b(?:placeholder|title|label|aria-label|alt|sublabel|description|subtitle|hint|helpText|tooltip|note|caption|sub|summary|heading|emptyText|confirmLabel|cancelLabel|ctaLabel|badge)="([^"]+)"/g;
/**
 * A JSX text node is bounded by a tag *or* an interpolation on either side —
 * four combinations, of which `>text<` is one. Matching only that one hid
 * every clause sitting next to a `{value}`: the lead in
 * `The five things {partner} producers have today` and the tail in
 * `<strong>Lead-in,</strong>{" "} the rest of the sentence.`
 *
 * 390 strings across 154 files this scan had already reported clean. Those
 * pages render a Chinese fragment welded to an English one, which reads worse
 * than either language alone would.
 *
 * Lookahead on the closing delimiter so two adjacent segments don't consume
 * each other's boundary. The `[^=]` guard is the price of accepting one-word
 * copy: an arrow function returning a generic — `(id: string) => Promise<void>`
 * — reads as `>Promise<` to a regex, and the calendar alone has a dozen.
 */
const JSX_TEXT = /(?:^|[^=])([>}])([^<>{}]+)(?=([<{]))/g;

/**
 * What a piece of copy may START with.
 *
 * A letter, a digit, an arrow, an opening quote, or an emoji. Copy opens with
 * a number whenever it counts something ("3 bed / 2 bath in Lakewood",
 * "1. Estimate gross rental income"); with an arrow whenever it points
 * somewhere ("← All CMAs", "↻ Regenerate CMA", "↓ 12s vs last week"); with an
 * emoji whenever a button leads with its icon ("📄 Generate Report"); and with
 * a quote whenever a sentence opens by quoting something.
 *
 * The arrow set is deliberately only the glyphs that carry meaning the way a
 * word does. `·` and `—` stay out: they are separators, and anchoring on those
 * would drag in the fragments they separate rather than any copy.
 *
 * `“` is here as well as in BODY on purpose. #1470 put the curly pair in the
 * body class and closed the "sentence CONTAINING a quote" hole, but the anchor
 * is a separate gate, so a sentence that OPENS with `“` stayed invisible — an
 * easy thing to assume was already covered, and it was not.
 *
 * The `u` flag is load-bearing. Without it `\p{...}` is an identity escape, so
 * this silently becomes a class of the literal letters in
 * "Extended_Pictographic": it would not throw, it would not match an emoji,
 * and the finding count would look plausibly unchanged. That is the exact
 * shape of failure this file exists to prevent.
 */
/**
 * Lone lowercase words that are JavaScript, not English.
 *
 * The price of letting a lone lowercase word count next to an interpolation:
 * `} finally {` and `} catch {` are a brace, a bare keyword and a brace, which
 * is structurally identical to `{beds} bed {unit}`. Those two alone were 507 of
 * the first 647 findings — a scan that cries wolf, which is a scan that gets
 * ignored.
 *
 * Only the ones that can stand ALONE between two braces belong here; `else`,
 * `try`, `return` and friends are already rejected above by the
 * declaration-keyword rules.
 */
const LONE_KEYWORDS = new Set(["catch", "finally", "do", "in", "of", "this", "new"]);

const ANCHOR = /^(?:[A-Za-z0-9↓↑←→↻“]|\p{Extended_Pictographic})/u;

/**
 * What may follow the anchor. Variation selectors, ZWJ and skin-tone modifiers
 * carry nothing a reader sees but sit inside real emoji sequences (▶️, 👍🏽),
 * so the body has to tolerate them or those strings fail on their invisible
 * halves rather than on their words.
 */
const BODY =
  /^(?:[A-Za-z0-9 ,.'’“”!?:;%()/&+…←→↻—–·-]|\p{Extended_Pictographic}|[\uFE0F\u200D]|[\u{1F3FB}-\u{1F3FF}])*$/u;

/**
 * Files that stay English on purpose, with the reason.
 *
 * Distinct from PENDING: nothing here is waiting to be translated, so these
 * are exempt permanently rather than tracked down to zero. Adding one is a
 * decision, not a deferral — say why, or translate the file instead.
 */
const EXEMPT = new Map<string, string>([
  [
    "app/privacy/page.tsx",
    // English by product decision — see below.
    "Legal copy: English-only by decision, title localised separately",
  ],
  [
    "app/terms/page.tsx",
    "Legal copy: English-only by decision, title localised separately",
  ],
  [
    "app/opengraph-image.tsx",
    // next/og renders with a Latin-only default font. Chinese here would come
    // out as tofu boxes in every social preview, which is worse than English.
    "OG image: next/og default font has no CJK glyphs",
  ],
  [
    "app/dashboard/ai-sales-assistant/SalesAssistantClient.tsx",
    /*
     * The English here is a system prompt sent to the voice model, not copy on
     * a screen. Translating it because the AGENT'S dashboard is in Chinese
     * would make the assistant greet English-speaking CALLERS in Chinese —
     * the language of a call belongs to whoever picks up, not to the UI.
     */
    "Voice system prompt: model input, and the caller chooses the language",
  ],
]);

/*
 * There used to be a PENDING list here — pages carrying i18n chrome whose body
 * copy was still being worked through. It peaked at 236 files and is now
 * empty, so it is gone along with the assertion that kept it shrinking. The
 * contract is simply that no internationalised file contains English.
 */

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) {
      if (name !== "node_modules" && name !== "__tests__") walk(p, out);
    } else if (p.endsWith(".tsx")) out.push(p);
  }
  return out;
}

/**
 * Blank comments rather than delete them: deleting shifts every line number
 * after the first comment, so the reported location doesn't match the file.
 */
const blankComments = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " ")).replace(/^(\s*)\/\/.*$/gm, "$1");

/**
 * A <code> block is a sample the reader retypes, not copy — the setup steps on
 * the calendar page show a literal Gmail filter, and translating it would give
 * a Chinese-speaking agent a search that matches nothing.
 */
const blankCode = (s: string) =>
  s
    .replace(/<code\b[^>]*>[\s\S]*?<\/code>/g, (m) => m.replace(/[^\n]/g, " "))
    // CSS in a <style> block is selectors, not sentences: `html, body {`.
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/g, (m) => m.replace(/[^\n]/g, " "));

function isCopy(raw: string, nextToInterpolation: boolean): boolean {
  // A wrapped paragraph carries its indentation with it; compare on one line.
  const t = raw.replace(/\s+/g, " ").trim();
  if (ALLOWED.has(t)) return false;
  /*
   * A blank line inside the match means the `>` and the `<` belong to
   * different statements, not to one text node: `endX > W - 90;` followed by
   * a blank line and `return (` reads as copy once the whitespace collapses.
   * Wrapped copy carries single newlines, never an empty line.
   */
  if (/\n\s*\n/.test(raw)) return false;
  /*
   * Three shapes of code that read as copy once a `}` can open the match:
   * a cast tail (`} as Record<`), a statement resuming after a block, and a
   * call whose arguments span lines. Each was a real false positive, not a
   * hypothetical — the alternative is a scan that cries wolf and gets ignored.
   */
  if (/^(?:as|satisfies) (?:const\b|[A-Z])/.test(t)) return false;
  /*
   * Declaration keywords, all lowercase and none of which open English copy
   * the way `for` and `if` do — `new`, `case`, `class` and `type` are left out
   * deliberately, because "new listings", "case study" and "Class A
   * properties" are all real copy in this app.
   */
  if (/^(?:export|import|static|default|throw|break|continue|enum|interface)\b/.test(t)) return false;
  // `for` and `if` open English sentences too ("for best fit"), so the
  // statement rejection demands the paren that a keyword would carry.
  if (/^(?:if|for|while|switch|catch)\s*\(/.test(t)) return false;
  if (/^(?:return|const|let|var|function|else|try|await|typeof)\b/.test(t)) return false;
  /*
   * A call, including a dotted or optionally-chained one. `foo(` was already
   * rejected; `agentsById.set(`, `pane.scrollTo(` and
   * `rootRef.current?.scrollIntoView(` were not — and each reads as a lone
   * lowercase "word" the moment one of those is allowed to count.
   */
  if (/^[a-z][\w$]*(?:\??\.[A-Za-z_$][\w$]*)*\(/.test(t)) return false;
  /*
   * The price of letting a match open with a digit: a numeric literal resuming
   * a statement. Both hits were real, not hypothetical — `0 ? Math.ceil(
   * closingCosts / monthlySavings) : 0; return` (the `>` came from
   * `monthlySavings >`) and `0).length ?? 0; return` (a call's closing paren).
   * Copy that opens with a number puts a word or a unit after it — "3 bed",
   * "24/7", "1. Understand", "1 (spread out)" — never a ternary `?` or a `)`.
   */
  if (/^\d+\s*(?:[?)]|&&|\|\|)/.test(t)) return false;
  /*
   * A statement boundary: `> horizon) continue; alerts.push(`. Prose uses
   * semicolons too, but a prose semicolon is followed by a word — never by an
   * identifier that immediately calls or dereferences something.
   */
  if (/;\s*[a-z_$][\w$]*[.(]/.test(t)) return false;
  if (/[{}<>$`]/.test(t)) return false; // interpolated or markup — not a literal
  /*
   * The anchor accepts a digit or an arrow, not just a letter. Copy opens with
   * a number whenever it counts something — "3 bed / 2 bath in Lakewood",
   * "1. Estimate gross rental income", "5-business-day guarantee." — and with
   * an arrow whenever it points at a delta: "↓ 12s vs last week". A person
   * reads all of it. `↓↑` and no further glyphs on purpose: an arrow carries
   * meaning the way a word does, while `·` and `—` are separators, and
   * anchoring on those would drag in the fragments they separate.
   */
  if (!ANCHOR.test(t)) return false;
  /*
   * Compare the remainder by CODE POINT, not `.slice(1)`. An emoji anchor is a
   * surrogate pair, and slicing one in half leaves a lone surrogate that fails
   * BODY for a reason that has nothing to do with the copy.
   */
  if (!BODY.test(t.slice([...t][0].length))) return false;
  const words = t.split(/\s+/).filter((w) => /[A-Za-z]/.test(w)).length;
  /*
   * One-word copy counts too. Requiring two words hid every Save, Cancel,
   * Done, Notes and Paid in the app — 42 of them, on pages that were otherwise
   * fully translated.
   *
   * Capitalisation used to be the whole test, which is why the units in
   * `{subject.beds} bed / {subject.baths} bath / {subject.sqft} sqft` sat in
   * English on a page that was otherwise entirely Chinese, and why `{n} days`,
   * `{n} visitors` and `{n} overdue` did the same on 54 others.
   *
   * Simply dropping the capital is not the fix: that gives 694 findings across
   * 246 files — `finally`, `catch`, `days`, `subs`, `n/a` — and a scan that
   * cries wolf protects nothing.
   *
   * So a lone LOWERCASE word counts only when it is a SIBLING of an
   * interpolation. `{beds} bed` is a label beside a value the app is printing;
   * `=> value <` is not, because there the `<` opens a generic rather than a
   * tag. Adjacency is not enough — the discriminator is that one of this text
   * node's own delimiters is a brace, which is why JSX_TEXT captures them.
   */
  if (words === 1) {
    if (t.length < 3) return false;
    if (/^[A-Z]/.test(t)) return true;
    return nextToInterpolation && !LONE_KEYWORDS.has(t);
  }
  return words >= 2 && t.length >= 6;
}

/**
 * Every piece of copy in one source, as `{ offset, text }`.
 *
 * Extracted so the scan the suite runs over the app is the SAME code the
 * self-test pins. The two matchers are no longer interchangeable and no longer
 * share a loop: JSX_TEXT captures its DELIMITERS as well as its text, because
 * whether a text node touches an interpolation is what separates a label from
 * an identifier. An attribute value has no such context — it is copy or it is
 * nothing.
 */
function scan(body: string): Array<{ offset: number; text: string }> {
  const out: Array<{ offset: number; text: string }> = [];
  for (const m of body.matchAll(JSX_TEXT)) {
    const [, opener, text, closer] = m;
    if (isCopy(text, opener === "}" || closer === "{")) {
      out.push({ offset: m.index ?? 0, text });
    }
  }
  for (const m of body.matchAll(COPY_ATTRS)) {
    if (isCopy(m[1], false)) out.push({ offset: m.index ?? 0, text: m[1] });
  }
  return out;
}

describe("copy anchor", () => {
  /**
   * The `u` flag on ANCHOR is the reason this test exists.
   *
   * Without it, `\p{Extended_Pictographic}` is an identity escape and the class
   * silently becomes the literal letters of "Extended_Pictographic": no throw,
   * no emoji match, and a finding count that looks plausibly unchanged. That is
   * a green suite hiding a broken scan, which is the failure mode this whole
   * file exists to prevent — so it gets asserted rather than assumed.
   */
  const opens = (t: string) =>
    ANCHOR.test(t) && BODY.test(t.slice([...t][0].length));

  it("accepts copy that opens with something other than a letter", () => {
    for (const t of [
      "← All CMAs",
      "↻ Regenerate CMA",
      "📄 Generate Report",
      "🗑 Delete offer",
      "“Reply STOP to unsubscribe” is added automatically.",
      "2 urgent tasks",
      "↓ 12s vs last week",
      "Save changes",
    ]) {
      expect(opens(t), t).toBe(true);
    }
  });

  it("tolerates the invisible halves of an emoji sequence", () => {
    // A variation selector and a ZWJ carry nothing a reader sees, but a body
    // class that rejects them fails the string on its punctuation.
    expect(opens("🖨️ Print open-house flyer")).toBe(true);
    expect(opens("🧑‍💼 Lifelike avatar")).toBe(true);
  });

  it("rejects a numeric literal resuming an expression, but not a count", () => {
    /*
     * The price of a digit anchor. These four are real false positives from
     * the app, not hypotheses — a ternary tail, a logical tail, a closing
     * paren. The malformed version of this alternation (`\|\` instead of
     * `\|\|`) still passed the cases it was written for, which is why the
     * copy half is asserted alongside them.
     */
    for (const code of ["0 && !connectionId)", "0 || fallback)", "0 ? a : b", "0).length"]) {
      expect(isCopy(code, true), code).toBe(false);
    }
    for (const copy of [
      "3 bed / 2 bath",
      "24/7 — no payroll, benefits, or turnover",
      "1. Estimate gross rental income",
      "7+ days inactive",
    ]) {
      expect(isCopy(copy, false), copy).toBe(true);
    }
  });

  it("still rejects a separator-led fragment", () => {
    // `·` and `—` separate copy rather than being it; anchoring on them would
    // drag in the fragments either side.
    expect(opens("· 4 active deals")).toBe(false);
    expect(opens("— pulled from the listing")).toBe(false);
  });
});

describe("the scan itself", () => {
  /**
   * This is not ceremony, it is the test that would have caught me.
   *
   * Adding the delimiter captures to JSX_TEXT moved the text from `m[1]` to
   * `m[2]`. For one run the scan therefore tested `isCopy(">")` against every
   * text node in the app and pronounced the whole codebase clean — it went
   * GREEN, which is the one outcome nobody investigates. A planted canary
   * caught it; nothing else in this file would have.
   *
   * So the fixture carries one example of every shape the scan must see, and
   * two it must not: a bare keyword between braces (`} finally {` is
   * structurally identical to `{beds} bed {unit}`) and a dotted call.
   */
  it("finds each shape of copy, and no code", () => {
    const found = scan(
      [
        "<span>← Arrow led</span>",
        "<span>📄 Emoji led</span>",
        "<span>“Quote led” and more</span>",
        "<span>{n} widgets</span>",
        '<p title="↻ Attribute copy" />',
        "<span>Capitalised</span>",
        "try { a(); } catch { b(); } finally { c(); }",
        "{ items.forEach(( i ) => { pane.scrollTo( i ); }) }",
      ].join("\n"),
    ).map((f) => f.text.replace(/\s+/g, " ").trim());

    expect(found).toEqual([
      "← Arrow led",
      "📄 Emoji led",
      "“Quote led” and more",
      "widgets",
      "Capitalised",
      "↻ Attribute copy",
    ]);
  });

  it("counts a lone lowercase word only beside an interpolation", () => {
    const beside = scan("<span>{beds} bed</span>").map((f) => f.text.trim());
    expect(beside).toEqual(["bed"]);
    // The same word between two tags is a word in a sentence fragment, not a
    // label, and far more often an identifier.
    expect(scan("<span>bed</span>")).toEqual([]);
  });
});

describe("residual English", () => {
  it("does not linger in files that are already internationalised", () => {
    const findings: string[] = [];
    for (const root of SCAN) {
      for (const file of walk(join(ROOT, root))) {
        const src = readFileSync(file, "utf8");
        if (!/useTranslation|getServerT/.test(src)) continue;
        if (EXEMPT.has(relative(ROOT, file).split(sep).join("/"))) continue;
        /*
         * Scan the whole file, not line by line: a text node that wraps has no
         * `>text<` on any single line, so a per-line scan reports it clean.
         * Line numbers come from counting newlines up to the match offset.
         */
        const body = blankCode(blankComments(src));
        const at = (offset: number) => body.slice(0, offset).split("\n").length;
        const rel = relative(ROOT, file).split(sep).join("/");
        // Through `scan`, so the code pinned by the self-test above is the
        // code that runs here. They drifted apart once and it went green.
        for (const { offset, text } of scan(body)) {
          findings.push(
            `${rel}:${at(offset)}  ${text.replace(/\s+/g, " ").trim().slice(0, 80)}`,
          );
        }
      }
    }
    expect(findings, `\n${findings.join("\n")}\n`).toEqual([]);
  });
});
