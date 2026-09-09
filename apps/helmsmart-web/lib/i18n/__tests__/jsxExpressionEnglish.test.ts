import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import ts from "typescript";
import { describe, expect, it } from "vitest";

import { PROPER_NOUNS } from "./bundles";

/**
 * English that reaches the screen from INSIDE a JSX expression.
 *
 *     {loading ? "Signing in…" : "Sign in"}
 *     {client.name || "Unnamed client"}
 *     title={saving ? "Saving…" : "Save changes"}
 *
 * Ported from `apps/leadsmartai/lib/i18n/__tests__/jsxExpressionEnglish.test.ts`.
 * {@link ./residualEnglish.test.ts} cannot see any of this. It reads JSX text
 * nodes and copy attributes, and a string literal inside `{…}` is neither — so
 * a whole signed-out auth flow ("Log in", "Email me a reset link", "Enter your
 * email address first.") sat in English while that scan reported every one of
 * those files clean. 482 strings across 125 files were hiding here.
 *
 * WHY A PARSER. The hard part is not finding string literals, it is telling
 * copy from the rest — `className={active ? "bg-white" : "bg-slate-50"}` is the
 * same syntax as the examples above. Only the AST knows which JSX attribute a
 * literal belongs to, so this walks the real TypeScript tree rather than
 * guessing with a regex. A regex version of this check produced ~2,600
 * candidates that were overwhelmingly class names and route fragments; a scan
 * that cries wolf gets ignored, and then it protects nothing.
 *
 * WHAT COUNTS AS RENDERED. Two positions, and only two:
 *   - a child expression, `<p>{…}</p>`, whose value becomes text;
 *   - the value of an attribute a PERSON reads (title, placeholder, alt, …),
 *     never one the BROWSER reads (className, href, id, type).
 * From a literal the walk climbs only through shapes that still deliver it
 * there — a ternary, a `||` / `??` fallback, parentheses. Anything else (a
 * function call, an object literal, an array) means the string's destination is
 * no longer knowable here, so it is left alone.
 */

/** apps/helmsmart-web */
const ROOT = join(__dirname, "..", "..", "..");
const SCAN = ["app", "components"];

/**
 * Attributes a PERSON reads, never one the BROWSER reads.
 *
 * The second group are props on our own components rather than HTML
 * attributes, and both scans here were blind to them until a QA pass found an
 * approval-policy setting — the control deciding whether the AI messages
 * clients unsupervised — explained only in English via `sublabel`. Kept in step
 * with the same list in residualEnglish.test.ts, which catches the plain-string
 * form; this one catches the expression form.
 */
const COPY_ATTRS = new Set([
  "title",
  "placeholder",
  "alt",
  "aria-label",
  "aria-description",
  "label",
  "sublabel",
  "description",
  "subtitle",
  "hint",
  "helpText",
  "tooltip",
  "note",
  "caption",
  "summary",
  "heading",
  "emptyText",
  "confirmLabel",
  "cancelLabel",
  "ctaLabel",
  "badge",
]);

/**
 * Identical in both locales on purpose: product and platform names. A brand
 * does not get translated, and writing 谷歌 next to a Google sign-in button
 * would be wrong, not thorough. Shared with the other two scans through
 * `./bundles` so they cannot disagree.
 */
const ALLOWED = PROPER_NOUNS;

/**
 * Files that stay English on purpose.
 *
 * Empty on purpose — see the same note in residualEnglish.test.ts. The source
 * app's entries were its legal pages, English-only by product decision, which
 * entered this scan's scope only when their TITLE was localised.
 */
const EXEMPT = new Set<string>([]);

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) {
      if (name !== "node_modules" && name !== "__tests__") walk(p, out);
    } else if (p.endsWith(".tsx")) out.push(p);
  }
  return out;
}

function isCopy(raw: string): boolean {
  const t = raw.trim();
  if (ALLOWED.has(t)) return false;
  if (t.length < 3) return false;
  if (!/^[A-Z]/.test(t)) return false; // copy opens with a capital
  if (!/[a-z]{2}/.test(t)) return false; // not an acronym or a CONST
  if (/[<>{}$`\\]/.test(t)) return false; // markup or an interpolation
  if (/^https?:|^\/|^#|^[A-Za-z]+\/[A-Za-z]/.test(t)) return false; // urls, paths
  /*
   * Tailwind reads as capitalised words often enough to matter, and a class
   * string is the single most common literal in this codebase.
   */
  if (/\b(?:px|py|mt|mb|ml|mr|pt|pb|pl|pr|gap|rounded|bg|text|border|flex|grid|w|h)-/.test(t)) {
    return false;
  }
  if (!/^[A-Za-z][A-Za-z0-9 ,.'’“”!?:;%()/&+…→—–-]*$/.test(t)) return false;
  const words = t.split(/\s+/).filter((w) => /[A-Za-z]/.test(w)).length;
  return words >= 2 || t.length >= 4;
}

type Context = { kind: "child" | "attr"; name?: string };

/** Where this literal ends up, or null if it does not reach the screen. */
function renderContext(node: ts.Node): Context | null {
  let cur: ts.Node | undefined = node.parent;
  let depth = 0;
  while (cur && depth < 8) {
    if (ts.isJsxAttribute(cur)) {
      const name = cur.name.getText();
      return COPY_ATTRS.has(name) ? { kind: "attr", name } : null;
    }
    if (ts.isJsxExpression(cur)) {
      // Annotated: `cur` is reassigned from `p` below, and inference would
      // otherwise chase its own tail (TS7022).
      const p: ts.Node | undefined = cur.parent;
      /*
       * A JsxExpression sits under either a JSX element (a child) or a JSX
       * attribute (`title={…}`). The source version returned null for the
       * second case, so its whole attribute half only ever matched the plain
       * `title="…"` form — which `residualEnglish` already covers — and the
       * shape its own header advertises, `title={saving ? "Saving…" : "Save
       * changes"}`, fell through both scans' expression paths. Climbing to the
       * attribute is what makes the guard do what it says.
       */
      if (p && ts.isJsxAttribute(p)) {
        cur = p;
        depth += 1;
        continue;
      }
      return p && (ts.isJsxElement(p) || ts.isJsxFragment(p)) ? { kind: "child" } : null;
    }
    if (
      ts.isConditionalExpression(cur) ||
      ts.isBinaryExpression(cur) ||
      ts.isParenthesizedExpression(cur)
    ) {
      cur = cur.parent;
      depth += 1;
      continue;
    }
    return null;
  }
  return null;
}

/** Every rendered English literal in one source, as the suite reports them. */
function scanSource(file: string, src: string): string[] {
  const findings: string[] = [];
  const sf = ts.createSourceFile(
    file,
    src,
    ts.ScriptTarget.Latest,
    /* setParentNodes */ true,
    ts.ScriptKind.TSX,
  );
  const visit = (node: ts.Node): void => {
    if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
      if (isCopy(node.text)) {
        const ctx = renderContext(node);
        if (ctx) {
          const line = sf.getLineAndCharacterOfPosition(node.getStart()).line + 1;
          const where = ctx.name ? `${ctx.kind}:${ctx.name}` : ctx.kind;
          findings.push(`${file}:${line}  [${where}]  ${node.text}`);
        }
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return findings;
}

/*
 * The scan is pinned before it is trusted, for the same reason the sibling
 * suite pins its own: a walk that stops finding things goes GREEN, which is
 * the one outcome nobody investigates.
 */
describe("the expression scan itself", () => {
  const texts = (src: string) => scanSource("x.tsx", src).map((f) => f.split("  ").pop());

  it("sees both arms of a ternary in a child expression", () => {
    expect(texts('const A = () => <p>{loading ? "Signing in…" : "Sign in now"}</p>;')).toEqual([
      "Signing in…",
      "Sign in now",
    ]);
  });

  it("sees a fallback behind ?? and ||", () => {
    expect(texts('const A = () => <p>{client.name || "Unnamed client"}</p>;')).toEqual([
      "Unnamed client",
    ]);
  });

  it("sees an attribute a person reads, and ignores one the browser reads", () => {
    expect(texts('const A = () => <i title={x ? "Client opted out" : ""} />;')).toEqual([
      "Client opted out",
    ]);
    expect(texts('const A = () => <i className={x ? "Rounded border" : ""} />;')).toEqual([]);
  });

  it("leaves a literal whose destination is no longer knowable", () => {
    // Inside a call the string may be a key, a log line or an id — the AST
    // stops being able to say, so the scan stops guessing.
    expect(texts('const A = () => <p>{t("invoices.list.title")}</p>;')).toEqual([]);
    expect(texts('const A = () => <p>{fmt({ label: "Some English here" })}</p>;')).toEqual([]);
  });

  it("lets a proper noun through", () => {
    expect(texts('const A = () => <p>{x ? "HelmSmart" : "Google Business"}</p>;')).toEqual([]);
  });
});

describe("English inside JSX expressions", () => {
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
        const rel = relative(ROOT, file).split(sep).join("/");
        if (EXEMPT.has(rel)) continue;
        findings.push(...scanSource(rel, src));
      }
    }
    expect(findings, `\n${findings.join("\n")}\n`).toEqual([]);
  });
});
