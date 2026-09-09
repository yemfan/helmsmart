import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { describe, expect, it } from "vitest";

import { PROPER_NOUNS } from "./bundles";

/**
 * "This page is translated" is a weaker claim than it sounds.
 *
 * Ported from `apps/leadsmartai/lib/i18n/__tests__/residualEnglish.test.ts`,
 * where every file it now covers passed the `useTranslation` check while
 * English strings were still rendering out of them — headings, form labels,
 * tooltips, and a module-scope JSX constant in the sidebar itself.
 *
 * The check covers JSX text nodes and copy-carrying attributes. It was widened
 * five times over there, each time after the narrower version reported a page
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
 *     anchor was `[A-Za-z]`, so a numbered step ("1. Reconcile the bank feed"),
 *     a span of hours ("24/7 — no payroll, benefits, or turnover") and a
 *     sublabel ("7+ days inactive") were all invisible;
 *   - the `sub` prop — 3 strings, every one of them a KPI tile sublabel. A
 *     small number for a hole with no floor: `sub` was missing from
 *     COPY_ATTRS only because it is spelled shorter than `sublabel`, and any
 *     component that names its sublabel that way inherited the blind spot.
 *
 * The cost of widening is false positives, so each widening is paid for by a
 * specific guard: capitalisation for single words, a `[^=]` lookbehind for
 * arrow functions, rejection of cast tails, resumed statements and calls once
 * a `}` can open a match, and rejection of a numeric literal resuming a
 * statement once a digit can. A scan that cries wolf gets ignored, and then it
 * protects nothing.
 */

/** apps/helmsmart-web */
const ROOT = join(__dirname, "..", "..", "..");
const SCAN = ["app", "components"];

/**
 * Proper nouns that are correct as-is in every language.
 *
 * Shared with `untranslatedValues` and `jsxExpressionEnglish` through
 * `./bundles`, so the three scans cannot disagree about whether "Google
 * Business" is English.
 */
const ALLOWED = PROPER_NOUNS;

/**
 * Attributes a PERSON reads.
 *
 * The second half of this list is the one that matters. `sublabel`, `hint`,
 * `description` and friends are not HTML attributes — they are props on our own
 * components, and every scan in the source suite was blind to them until a QA
 * pass found an approval-policy setting explained only in English:
 *
 *     sublabel="Safer. Every triggered message becomes a draft…"
 *
 * That is the control deciding whether the AI messages clients unsupervised,
 * and the sentence explaining the choice was in a language the reader may not
 * have. 70 strings across 36 files were hiding in this shape.
 *
 * A prop is on this list when its value is read by a human. `variant`, `size`,
 * `icon` and `href` are read by the browser and stay off it. `sub` is the same
 * prop as `sublabel` with a shorter name, so the two live or die together.
 *
 * `ariaLabel` is the same trap one more time. It is `aria-label` spelled as
 * a prop, and the `\b` in front of `label` refuses to match the tail of it,
 * so every button that names its screen-reader text that way was invisible.
 * What a screen reader announces is the one piece of copy a sighted reviewer
 * never sees, so it is the last place a blind spot should be.
 */
const ATTR_NAMES =
  "placeholder|title|label|aria-label|ariaLabel|alt|sublabel|description|subtitle|hint|helpText|tooltip|note|caption|sub|summary|heading|emptyText|confirmLabel|cancelLabel|ctaLabel|badge";

const COPY_ATTRS = new RegExp(`\\b(?:${ATTR_NAMES})="([^"]+)"`, "g");

/**
 * The same attributes, written as an EXPRESSION.
 *
 * `title="…"` and `title={…}` are the same tooltip to the reader and two
 * different shapes to a regex, and only the first one was ever checked. So a
 * ternary was a place English could sit inside a fully translated file and
 * come back clean:
 *
 *     title={optedOut ? "Contact opted out — AI drafting disabled." : undefined}
 *
 * 35 strings across 16 internationalised files were hiding in this shape in
 * the source app, and they are the worst 35 to lose: an attribute is a
 * tooltip, a placeholder or the label a screen reader announces, so a `title=`
 * the scan cannot see is copy nobody proof-reads in either language.
 *
 * A brace-delimited expression cannot be matched by a regex — it nests — so
 * this half of the scan finds the opening `attr={` and walks to its partner,
 * then reads the string literals inside. What comes out is passed through the
 * same `isCopy` gate as everything else.
 */
const COPY_ATTR_EXPR = new RegExp(`\\b(?:${ATTR_NAMES})=\\{`, "g");

/**
 * String literals inside a braced attribute, minus the ones that are not copy.
 *
 * The price of reading an expression instead of a value: an expression holds
 * code as well as copy, and three shapes of code look exactly like a short
 * sentence.
 *
 *   - A COMPARISON OPERAND. `title={status === "needs review" ? …}` compares
 *     against a database enum, and "needs review" is two lowercase words over
 *     six characters — indistinguishable from a label by any rule in `isCopy`.
 *   - A TRANSLATION KEY, which is what most of these expressions contain once
 *     a surface is converted. `t("invoices.save")` survives `isCopy` only
 *     because it has no spaces; a key with a `defaultValue` beside it would
 *     not, and shipping a key ahead of its translation is documented practice.
 *   - A CLASS STRING. `label={cn("text-xs font-semibold", x && "opacity-60")}`
 *     is Tailwind, not English, and it is two words over six characters.
 *
 * Each is excluded by where it SITS rather than by what it says, because what
 * it says is not distinguishable from copy.
 */
const COMPARISON_BEFORE = /(?:===|!==|==|!=)\s*$/;
const CALL_BEFORE = /\b(?:t|tr|cn|clsx|classNames|tw)\(\s*$/;
/*
 * `defaultValue` is the documented way to ship a key ahead of its translation
 * — `missingKeys` exempts the same shape by name — so the English beside one
 * is a fallback for a miss, not the string on the screen.
 */
const DEFAULT_VALUE_BEFORE = /\bdefaultValue:\s*$/;

/**
 * String literals in `expr`, found by walking it rather than matching it.
 *
 * A regex cannot do this. `'e.g. "How did the visit go?"'` is ONE
 * single-quoted string containing two double quotes, and a `"([^"]+)"` rule
 * reports its middle while a `'([^']+)'` rule bolted alongside would pair the
 * apostrophes in `"You've hit this period's cap."` and report the code
 * between them. Quote state has to be tracked, so it is.
 *
 * A TEMPLATE literal is read too, with each `${…}` hole collapsed to a single
 * `…`. Reading the static chunks separately does not work: split on its holes,
 *
 *     `Select "${task.title}" to add to Tasks list`
 *
 * becomes `Select "` and `" to add to Tasks list`, and neither half is copy by
 * any rule here — the first ends mid-quote, the second OPENS on one. Collapsed
 * it is `Select "…" to add to Tasks list`, which is the sentence the reader
 * actually gets, and which fails the scan exactly as it should.
 *
 * The collapse is also what makes a key BUILT by template distinguishable from
 * a sentence: `invoices.status.${x}` collapses to a dotted path with no spaces
 * in it, and is dropped below.
 */
type Literal = { at: number; value: string; template: boolean };

function stringLiterals(expr: string): Literal[] {
  const out: Literal[] = [];
  for (let i = 0; i < expr.length; i += 1) {
    const q = expr[i];
    if (q === "`") {
      let j = i + 1;
      let text = "";
      let closed = false;
      while (j < expr.length) {
        if (expr[j] === "\\") {
          text += expr[j + 1] ?? "";
          j += 2;
          continue;
        }
        if (expr[j] === "`") {
          closed = true;
          break;
        }
        if (expr[j] === "$" && expr[j + 1] === "{") {
          /*
           * Walk the hole to its partner brace. A hole can hold anything,
           * including another template — `${a ? `x` : `y`}` — so backticks
           * inside it are skipped along with the braces they sit between.
           */
          let depth = 0;
          let k = j + 1;
          for (; k < expr.length; k += 1) {
            if (expr[k] === "`") {
              const inner = expr.indexOf("`", k + 1);
              if (inner === -1) break;
              k = inner;
              continue;
            }
            if (expr[k] === "{") depth += 1;
            else if (expr[k] === "}") {
              depth -= 1;
              if (depth === 0) break;
            }
          }
          if (k >= expr.length) break; // unterminated — stop rather than guess
          text += "…";
          j = k + 1;
          continue;
        }
        text += expr[j];
        j += 1;
      }
      if (!closed) break;
      out.push({ at: i, value: text, template: true });
      i = j;
      continue;
    }
    if (q !== '"' && q !== "'") continue;
    let j = i + 1;
    while (j < expr.length && expr[j] !== q) {
      if (expr[j] === "\\") j += 1; // an escaped quote does not close it
      j += 1;
    }
    if (j >= expr.length) break; // unterminated — stop rather than guess
    out.push({ at: i, value: expr.slice(i + 1, j), template: false });
    i = j;
  }
  return out;
}

function attrExprCopy(body: string): Array<{ offset: number; text: string; template: boolean }> {
  const out: Array<{ offset: number; text: string; template: boolean }> = [];
  for (const m of body.matchAll(COPY_ATTR_EXPR)) {
    const open = (m.index ?? 0) + m[0].length - 1;
    let depth = 0;
    let end = open;
    for (let i = open; i < body.length; i += 1) {
      if (body[i] === "{") depth += 1;
      else if (body[i] === "}") {
        depth -= 1;
        if (depth === 0) {
          end = i;
          break;
        }
      }
    }
    if (end === open) continue; // unbalanced — not our business
    const expr = body.slice(open + 1, end);
    for (const { at, value, template } of stringLiterals(expr)) {
      const before = expr.slice(0, at);
      if (COMPARISON_BEFORE.test(before)) continue;
      if (CALL_BEFORE.test(before)) continue;
      if (DEFAULT_VALUE_BEFORE.test(before)) continue;
      /*
       * A key, not a sentence: dotted, no spaces. `t(` already caught most of
       * them. Dropping the collapsed holes first is what lets the same rule
       * recognise a key BUILT by template — `books.x.${id}` arrives here as
       * `books.x.…`, and a key is still a key for having a hole in it.
       */
      if (/^[\w-]*(?:\.[\w-]*)+$/.test(value.replace(/…/g, ""))) continue;
      out.push({ offset: open + 1 + at, text: value, template });
    }
  }
  return out;
}

/**
 * A JSX text node is bounded by a tag *or* an interpolation on either side —
 * four combinations, of which `>text<` is one. Matching only that one hid
 * every clause sitting next to a `{value}`: the lead in
 * `The five things {partner} owners have today` and the tail in
 * `<strong>Lead-in,</strong>{" "} the rest of the sentence.`
 *
 * 390 strings across 154 files the source scan had already reported clean.
 * Those pages render a Chinese fragment welded to an English one, which reads
 * worse than either language alone would.
 *
 * Lookahead on the closing delimiter so two adjacent segments don't consume
 * each other's boundary. The `[^=]` guard is the price of accepting one-word
 * copy: an arrow function returning a generic — `(id: string) => Promise<void>`
 * — reads as `>Promise<` to a regex, and the calendar alone has a dozen.
 */
const JSX_TEXT = /(?:^|[^=])([>}])([^<>{}]+)(?=([<{]))/g;

/**
 * Lone lowercase words that are JavaScript, not English.
 *
 * The price of letting a lone lowercase word count next to an interpolation:
 * `} finally {` and `} catch {` are a brace, a bare keyword and a brace, which
 * is structurally identical to `{hours} hrs {unit}`. Those two alone were 507
 * of the first 647 findings in the source app — a scan that cries wolf, which
 * is a scan that gets ignored.
 *
 * Only the ones that can stand ALONE between two braces belong here; `else`,
 * `try`, `return` and friends are already rejected by the declaration-keyword
 * rules in `isCopy`.
 */
const LONE_KEYWORDS = new Set(["catch", "finally", "do", "in", "of", "this", "new"]);

/**
 * What a piece of copy may START with.
 *
 * A letter, a digit, an arrow, an opening quote, or an emoji. Copy opens with
 * a number whenever it counts something ("3 open invoices", "1. Connect your
 * bank"); with an arrow whenever it points somewhere ("← All invoices",
 * "↻ Re-run", "↓ 12s vs last week"); with an emoji whenever a button leads
 * with its icon ("📄 Generate report"); and with a quote whenever a sentence
 * opens by quoting something.
 *
 * The arrow set is deliberately only the glyphs that carry meaning the way a
 * word does. `·` and `—` stay out: they are separators, and anchoring on those
 * would drag in the fragments they separate rather than any copy.
 *
 * The `u` flag is load-bearing. Without it `\p{...}` is an identity escape, so
 * this silently becomes a class of the literal letters in
 * "Extended_Pictographic": it would not throw, it would not match an emoji,
 * and the finding count would look plausibly unchanged. That is the exact
 * shape of failure this file exists to prevent, so `describe("copy anchor")`
 * below asserts it rather than assuming it.
 */
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
 * BODY, plus the straight double quote — for ATTRIBUTE literals only.
 *
 * Copy quotes things. A placeholder showing an owner what to say is one
 * single-quoted string with a quoted example inside it:
 *
 *     placeholder={x ? 'e.g. "How did the visit go?"' : …}
 *
 * Rejecting that on its quote characters loses two of the longest sentences
 * on the calling panels. But the same tolerance in BODY itself is a
 * disaster: a JSX text node is bounded by `}` and `{` as well as by tags, so
 * `} from "next"; import Link from "next/link"; import {` becomes copy, and
 * the scan goes from 45 findings to 1956 — every import line in the app.
 * That is the scan that cries wolf and then protects nothing.
 *
 * The difference is that an attribute literal is ALREADY KNOWN to be a
 * string: the tokenizer found its delimiters, so a quote inside one is
 * punctuation. A quote inside a text node is usually source. The tolerance
 * lives here, where that is known, and nowhere else.
 */
const ATTR_BODY =
  /^(?:[A-Za-z0-9 ,.'’“”"!?:;%()/&+…←→↻—–·-]|\p{Extended_Pictographic}|[\uFE0F\u200D]|[\u{1F3FB}-\u{1F3FF}])*$/u;

/**
 * Files that stay English on purpose, with the reason.
 *
 * Empty on purpose: HelmSmart has no page yet that is English by decision.
 * Adding one is a decision, not a deferral — say why, or translate the file
 * instead. The shapes that earned an entry in the source app were legal copy
 * (English-only by product decision), an OG image (next/og's default font has
 * no CJK glyphs, so Chinese renders as tofu), and a voice system prompt (the
 * language of a call belongs to whoever picks up, not to the dashboard).
 */
const EXEMPT = new Map<string, string>([]);

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
 * A <code> block is a sample the reader retypes, not copy — a setup step that
 * shows a literal Gmail filter would give a Chinese-speaking owner a search
 * that matches nothing if it were translated.
 */
const blankCode = (s: string) =>
  s
    .replace(/<code\b[^>]*>[\s\S]*?<\/code>/g, (m) => m.replace(/[^\n]/g, " "))
    // CSS in a <style> block is selectors, not sentences: `html, body {`.
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/g, (m) => m.replace(/[^\n]/g, " "))
    /*
     * An <address> element holds a postal address by HTML definition, and a
     * postal address has to stay in the form the post office reads no matter
     * who is looking at the page: the legal entity's registered name, the
     * street, the city-state-ZIP. The source app spelled each line out in
     * ALLOWED — four entries for one footer, which does not survive a second
     * office. The element is the rule.
     */
    .replace(/<address\b[^>]*>[\s\S]*?<\/address>/g, (m) => m.replace(/[^\n]/g, " "));

function isCopy(raw: string, nextToInterpolation: boolean, quoted = false): boolean {
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
   * deliberately, because "new invoices", "case study" and "Class A" are all
   * real copy.
   */
  if (/^(?:export|import|static|default|throw|break|continue|enum|interface)\b/.test(t)) return false;
  // `for` and `if` open English sentences too ("for best fit"), so the
  // statement rejection demands the paren that a keyword would carry.
  if (/^(?:if|for|while|switch|catch)\s*\(/.test(t)) return false;
  if (/^(?:return|const|let|var|function|else|try|await|typeof)\b/.test(t)) return false;
  /*
   * The tail of an import, between the `}` of its named bindings and the `{`
   * of the next one:
   *
   *     import { useTranslation } from 'react-i18next';
   *     import { Card } from '@helm/ui';
   *
   * reaches JSX_TEXT as `from 'react-i18next'; import`. The source app never
   * saw this because BODY rejects the straight DOUBLE quote and its imports
   * are double-quoted; a file that uses single quotes — and this app has them
   * — turns every import block into a finding. English prose does not open a
   * text node with `from '`.
   */
  if (/^from\s*["']/.test(t)) return false;
  /*
   * A call, including a dotted or optionally-chained one. `foo(` was already
   * rejected; `agentsById.set(`, `pane.scrollTo(` and
   * `rootRef.current?.scrollIntoView(` were not — and each reads as a lone
   * lowercase "word" the moment one of those is allowed to count.
   */
  if (/^[a-z][\w$]*(?:\??\.[A-Za-z_$][\w$]*)*\(/.test(t)) return false;
  /*
   * The price of letting a match open with a digit: a numeric literal resuming
   * a statement. Copy that opens with a number puts a word or a unit after it
   * — "3 bills", "24/7", "1. Connect", "1 (spread out)" — never a ternary `?`
   * or a `)`.
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
   * A US postal address. The company's own address in the footer, and the
   * example addresses in address fields, have to stay in the form the US post
   * office and a geocoder read, no matter who is looking at the page — the
   * correct Chinese for those words is the wrong thing to print or to type.
   * The source app spelled each one out in ALLOWED; the shape is the rule.
   * `untranslatedValues` carries the same test for bundle values.
   */
  if (/^\d+\s+[A-Za-z].*,\s*[A-Z]{2}(?:\s+\d{5}(?:-\d{4})?)?$/.test(t)) return false;
  if (!ANCHOR.test(t)) return false;
  /*
   * Compare the remainder by CODE POINT, not `.slice(1)`. An emoji anchor is a
   * surrogate pair, and slicing one in half leaves a lone surrogate that fails
   * BODY for a reason that has nothing to do with the copy.
   */
  if (!(quoted ? ATTR_BODY : BODY).test(t.slice([...t][0].length))) return false;
  const words = t.split(/\s+/).filter((w) => /[A-Za-z]/.test(w)).length;
  /*
   * One-word copy counts too. Requiring two words hid every Save, Cancel,
   * Done, Notes and Paid in the source app — 42 of them, on pages that were
   * otherwise fully translated.
   *
   * Capitalisation used to be the whole test, which is why the units in
   * `{hours} hrs / {rate} per hour` sat in English on a page that was
   * otherwise entirely Chinese, and why `{n} days`, `{n} visitors` and
   * `{n} overdue` did the same on 54 others.
   *
   * Simply dropping the capital is not the fix: that gave 694 findings across
   * 246 files — `finally`, `catch`, `days`, `subs`, `n/a` — and a scan that
   * cries wolf protects nothing.
   *
   * So a lone LOWERCASE word counts only when it is a SIBLING of an
   * interpolation. `{hours} hrs` is a label beside a value the app is
   * printing; `=> value <` is not, because there the `<` opens a generic
   * rather than a tag. Adjacency is not enough — the discriminator is that one
   * of this text node's own delimiters is a brace, which is why JSX_TEXT
   * captures them.
   */
  if (words === 1) {
    if (t.length < 3) return false;
    /*
     * A lone token with no two lowercase letters is an acronym, an enum value
     * or a CONST — never a word anyone translates. `jsxExpressionEnglish`
     * applies the same rule ("not an acronym or a CONST"); residualEnglish
     * inherited its allow-list instead, which is why PDF, CSV and SMS are
     * named in PROPER_NOUNS one at a time.
     *
     * It is the rule, not the list, that holds up: an OFX statement quoted
     * verbatim into a template literal reaches this scan as `>INFO<`, `>ENG<`,
     * `>USD<`, `>CHECKING<` — a file format the owner's bank writes, and the
     * scan has no way to name every tag in it. Real one-word copy always
     * carries two lowercase letters ("Save", "Cancel", "Notes:"), so nothing
     * this guard exists for is lost.
     */
    if (!/[a-z]{2}/.test(t)) return false;
    if (/^[A-Z]/.test(t)) return true;
    return nextToInterpolation && !LONE_KEYWORDS.has(t);
  }
  return words >= 2 && t.length >= 6;
}

/**
 * Every piece of copy in one source, as `{ offset, text }`.
 *
 * Extracted so the scan the suite runs over the app is the SAME code the
 * self-test pins. The two matchers are not interchangeable and do not share a
 * loop: JSX_TEXT captures its DELIMITERS as well as its text, because whether
 * a text node touches an interpolation is what separates a label from an
 * identifier. An attribute value has no such context — it is copy or it is
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
  for (const { offset, text, template } of attrExprCopy(body)) {
    /*
     * A template that OPENS on its value — `${count} clients selected` —
     * collapses to `… clients selected`, and ANCHOR rejects a leading `…`
     * for the same reason it rejects a leading `·`: a separator is not copy.
     * Here it is not a separator, it is the hole where the sentence starts,
     * so the anchor is taken from the first word instead. The finding still
     * REPORTS the collapsed sentence, because that is what the reader sees.
     */
    if (isCopy(template ? text.replace(/^[…\s]+/, "") : text, false, true)) {
      out.push({ offset, text });
    }
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
  const opens = (t: string) => ANCHOR.test(t) && BODY.test(t.slice([...t][0].length));

  it("accepts copy that opens with something other than a letter", () => {
    for (const t of [
      "← All invoices",
      "↻ Re-run report",
      "📄 Generate report",
      "🗑 Delete invoice",
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
    expect(opens("🖨️ Print the statement")).toBe(true);
    expect(opens("🧑‍💼 Assign an owner")).toBe(true);
  });

  it("rejects a numeric literal resuming an expression, but not a count", () => {
    /*
     * The price of a digit anchor. These four are real false positives from
     * the source app, not hypotheses — a ternary tail, a logical tail, a
     * closing paren. The malformed version of this alternation (`\|\` instead
     * of `\|\|`) still passed the cases it was written for, which is why the
     * copy half is asserted alongside them.
     */
    for (const code of ["0 && !connectionId)", "0 || fallback)", "0 ? a : b", "0).length"]) {
      expect(isCopy(code, true), code).toBe(false);
    }
    for (const copy of [
      "3 open invoices",
      "24/7 — no payroll, benefits, or turnover",
      "1. Connect your bank feed",
      "7+ days inactive",
    ]) {
      expect(isCopy(copy, false), copy).toBe(true);
    }
  });

  it("still rejects a separator-led fragment", () => {
    // `·` and `—` separate copy rather than being it; anchoring on them would
    // drag in the fragments either side.
    expect(opens("· 4 active projects")).toBe(false);
    expect(opens("— pulled from the invoice")).toBe(false);
  });

  it("leaves a US postal address in the form the post office reads", () => {
    expect(isCopy("6511 Parkriver Crossing, Sugar Land, TX 77479", false)).toBe(false);
    expect(isCopy("123 Main St, Austin, TX", false)).toBe(false);
    // Still copy: a sentence that merely begins with a number.
    expect(isCopy("3 open invoices, 2 overdue", false)).toBe(true);
  });

  it("blanks an <address> element, which is a postal address by definition", () => {
    const src = [
      "<address>",
      "  <span>MAXY Investment Inc.</span>",
      "  6511 Parkriver Crossing",
      "  Sugar Land, TX 77479",
      "</address>",
      "<p>Not an address at all</p>",
    ].join("\n");
    expect(scan(blankCode(src)).map((f) => f.text.trim())).toEqual(["Not an address at all"]);
  });

  it("does not read the tail of a single-quoted import as a sentence", () => {
    // `import { a } from 'x'; import {` — a `}`-to-`{` text node made of code.
    expect(isCopy("from 'react-i18next'; import", true)).toBe(false);
    expect(isCopy('from "@helm/ui"; import', true)).toBe(false);
    // Copy that legitimately starts with the word: two words, no quote after.
    expect(isCopy("from your last invoice", false)).toBe(true);
  });

  it("rejects a lone acronym, and keeps one-word copy", () => {
    // An OFX document quoted verbatim reaches the scan as a run of these.
    for (const t of ["INFO", "ENG", "USD", "CHECKING", "DEBIT"]) {
      expect(isCopy(t, false), t).toBe(false);
    }
    for (const t of ["Save", "Cancel", "Notes:", "Overdue"]) {
      expect(isCopy(t, false), t).toBe(true);
    }
  });

  it("lets a proper noun through in either language", () => {
    // "HelmSmart" and "Google Business" are the product's own names, and the
    // three scans that share this list have to agree about that.
    expect(isCopy("HelmSmart", false)).toBe(false);
    expect(isCopy("Google Business", false)).toBe(false);
  });
});

describe("the scan itself", () => {
  /**
   * This is not ceremony, it is the test that catches the author.
   *
   * Adding the delimiter captures to JSX_TEXT moved the text from `m[1]` to
   * `m[2]`. For one run the scan therefore tested `isCopy(">")` against every
   * text node in the app and pronounced the whole codebase clean — it went
   * GREEN, which is the one outcome nobody investigates. A planted canary
   * caught it; nothing else in this file would have.
   *
   * So the fixture carries one example of every shape the scan must see, and
   * two it must not: a bare keyword between braces (`} finally {` is
   * structurally identical to `{hours} hrs {unit}`) and a dotted call.
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

  /**
   * The braced half, pinned for the same reason as the fixture above: it is
   * the half that reads an EXPRESSION, so it is the half that can start
   * reporting code as copy without anyone noticing the difference.
   */
  it("reads copy out of a braced attribute, on both arms of a ternary", () => {
    const found = scan(
      '<button title={optedOut ? "Client opted out." : "Send the message now."} />',
    ).map((f) => f.text);
    expect(found).toEqual(["Client opted out.", "Send the message now."]);
  });

  it("ignores the code that shares those braces", () => {
    // A translation key and its call, an enum being compared, and a class
    // string — each is two words or dotted, and none is English on a screen.
    expect(scan('<p title={t("invoices.list.title")} />')).toEqual([]);
    expect(scan('<p title={status === "needs review" ? a : b} />')).toEqual([]);
    expect(scan('<p label={cn("text-xs font-semibold", on && "opacity-60")} />')).toEqual([]);
    // A fallback for a key that misses, not the string on the screen.
    expect(scan('<p title={t("a.key", { defaultValue: "Some English" })} />')).toEqual([]);
  });

  /**
   * Quote state, not a quote pattern.
   *
   * Both of these break a regex that pairs one quote character: the first is
   * ONE single-quoted string whose middle a `"…"` rule would report on its
   * own, and the second would have its apostrophes paired by a `'…'` rule
   * bolted alongside, reporting the code between them as English.
   */
  it("reads a literal that contains the other quote character", () => {
    expect(scan(`<p placeholder={x ? 'e.g. "How did the visit go?"' : y} />`)).toEqual([
      { offset: 20, text: 'e.g. "How did the visit go?"' },
    ]);
    expect(scan(`<p title={a ? "You've hit this period's cap." : b} />`).map((f) => f.text)).toEqual(
      ["You've hit this period's cap."],
    );
  });

  /**
   * A template literal, collapsed to the sentence the reader gets.
   *
   * Splitting on the holes instead would report nothing here: `Select "` ends
   * mid-quote and `" to add to Tasks list` opens on one, and neither half is
   * copy by any rule in this file. The whole point is that a person reads
   * across the hole.
   */
  it("reads a template literal with its holes collapsed", () => {
    expect(scan("<p title={`Other visits with ${name} (${n})`} />").map((f) => f.text)).toEqual([
      "Other visits with … (…)",
    ]);
    expect(
      scan('<p ariaLabel={`Select "${task.title}" to add to list`} />').map((f) => f.text),
    ).toEqual(['Select "…" to add to list']);
  });

  it("anchors a template on its first word, not on a leading hole", () => {
    // `${count} clients selected` collapses to `… clients selected`, and a
    // leading `…` is rejected by ANCHOR the way a leading `·` is.
    expect(scan("<p title={`${count} clients selected`} />").map((f) => f.text)).toEqual([
      "… clients selected",
    ]);
  });

  it("still drops a key that is BUILT by template", () => {
    expect(scan("<p title={x[`books.invoices.${id}`]} />")).toEqual([]);
    expect(scan("<p title={t(`books.status.${a.state}`)} />")).toEqual([]);
  });

  it("walks a hole that contains another template", () => {
    // `${a ? `x` : `y`}` — the backticks inside the hole are not the closer.
    const found = scan("<p title={`Due ${late ? `now` : `later`} for this client`} />");
    expect(found.map((f) => f.text)).toEqual(["Due … for this client"]);
  });

  it("still sees copy in a nested brace, and stops at the closing one", () => {
    const found = scan('<p title={{ a: "Nested copy here" }} />More text<span>').map((f) =>
      f.text.trim(),
    );
    expect(found).toContain("Nested copy here");
  });

  it("counts a lone lowercase word only beside an interpolation", () => {
    const beside = scan("<span>{hours} hrs</span>").map((f) => f.text.trim());
    expect(beside).toEqual(["hrs"]);
    // The same word between two tags is a word in a sentence fragment, not a
    // label, and far more often an identifier.
    expect(scan("<span>hrs</span>")).toEqual([]);
  });
});

describe("residual English", () => {
  it("does not linger in files that are already internationalised", () => {
    const findings: string[] = [];
    for (const root of SCAN) {
      let files: string[] = [];
      try {
        files = walk(join(ROOT, root));
      } catch {
        continue;
      }
      for (const file of files) {
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
          findings.push(`${rel}:${at(offset)}  ${text.replace(/\s+/g, " ").trim().slice(0, 80)}`);
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
