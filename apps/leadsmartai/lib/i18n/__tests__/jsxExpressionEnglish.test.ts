import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import ts from "typescript";
import { describe, expect, it } from "vitest";

/**
 * English that reaches the screen from INSIDE a JSX expression.
 *
 *     {loading ? "Logging in…" : "Log in"}
 *     {contact.name || "Unnamed lead"}
 *     title={saving ? "Saving…" : "Save changes"}
 *
 * {@link ./residualEnglish.test.ts} cannot see any of this. It reads JSX text
 * nodes and copy attributes, and a string literal inside `{…}` is neither — so
 * the whole signed-out auth flow ("Log in", "Email me a reset link", "Enter
 * your email address first.") sat in English while that scan reported every one
 * of those files clean. 482 strings across 125 files were hiding here.
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

const ROOT = join(__dirname, "..", "..", "..");
const SCAN = ["app", "components"];

/** Attributes whose value is read by a person rather than by the browser. */
/**
 * Attributes a PERSON reads, never one the BROWSER reads.
 *
 * The second group are props on our own components rather than HTML
 * attributes, and both scans here were blind to them until a QA pass found the
 * approval-policy setting — the control deciding whether an agent's AI texts
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
 * would be wrong, not thorough.
 */
const ALLOWED = new Set([
  "CloseBoss",
  "CloseBoss AI",
  "LeadSmart AI",
  "Google",
  "Apple",
  "Pinterest",
  "TikTok",
  "Zillow",
  "Redfin",
  "ElevenLabs",
  "OpenAI",
  "Resend",
]);

/**
 * Files that stay English on purpose.
 *
 * The legal pages are English-only by product decision (23 Aug 2026) — the
 * bilingual claim on the Signature tier is about the AI assistants meeting
 * clients in their language, not about translating the contract. They entered
 * this scan's scope only when their TITLE was localised, which is the part a
 * Chinese visitor actually needs.
 */
const EXEMPT = new Set(["app/privacy/page.tsx", "app/terms/page.tsx"]);

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
      const p = cur.parent;
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

describe("English inside JSX expressions", () => {
  it("does not linger in files that are already internationalised", () => {
    const findings: string[] = [];
    for (const root of SCAN) {
      for (const file of walk(join(ROOT, root))) {
        const src = readFileSync(file, "utf8");
        if (!/useTranslation|getServerT/.test(src)) continue;
        if (EXEMPT.has(relative(ROOT, file).split(sep).join("/"))) continue;
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
                const rel = relative(ROOT, file).split(sep).join("/");
                const where = ctx.name ? `${ctx.kind}:${ctx.name}` : ctx.kind;
                findings.push(`${rel}:${line}  [${where}]  ${node.text}`);
              }
            }
          }
          ts.forEachChild(node, visit);
        };
        visit(sf);
      }
    }
    expect(findings, `\n${findings.join("\n")}\n`).toEqual([]);
  });
});
