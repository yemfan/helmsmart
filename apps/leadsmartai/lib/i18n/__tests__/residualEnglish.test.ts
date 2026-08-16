import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * "This page is translated" turned out to be a weaker claim than it sounds.
 * Every file below passes the `useTranslation` check, and 46 English strings
 * were still rendering from them — headings, form labels, tooltips, and a
 * module-scope JSX constant in the sidebar itself.
 *
 * The check is deliberately narrow: JSX text nodes and copy-carrying
 * attributes, two words or more, no interpolation. That found real strings and
 * nothing spurious, which matters more than catching everything — a scan that
 * cries wolf gets ignored, and then it protects nothing.
 */

const ROOT = join(__dirname, "..", "..", "..");
const SCAN = ["app", "components"];

/** Proper nouns that are correct as-is in every language. */
const ALLOWED = new Set(["MAXY Investment Inc."]);

const COPY_ATTRS = /\b(?:placeholder|title|label|aria-label|alt)="([^"]+)"/g;
const JSX_TEXT = />([^<>{}]+)</g;

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

function isCopy(raw: string): boolean {
  const t = raw.trim();
  if (t.length < 6 || ALLOWED.has(t)) return false;
  if (/[{}<>$`]/.test(t)) return false; // interpolated or markup — not a literal
  if (!/^[A-Za-z][A-Za-z0-9 ,.'’!?:%()/&+-]*$/.test(t)) return false;
  return t.split(/\s+/).filter((w) => /[A-Za-z]/.test(w)).length >= 2;
}

describe("residual English", () => {
  it("does not linger in files that are already internationalised", () => {
    const findings: string[] = [];
    for (const root of SCAN) {
      for (const file of walk(join(ROOT, root))) {
        const src = readFileSync(file, "utf8");
        if (!/useTranslation|getServerT/.test(src)) continue;
        blankComments(src)
          .split("\n")
          .forEach((line, i) => {
            const hits: string[] = [];
            for (const m of line.matchAll(JSX_TEXT)) if (isCopy(m[1])) hits.push(m[1].trim());
            for (const m of line.matchAll(COPY_ATTRS)) if (isCopy(m[1])) hits.push(m[1].trim());
            for (const h of hits) {
              findings.push(`${relative(ROOT, file).split(sep).join("/")}:${i + 1}  ${h.slice(0, 80)}`);
            }
          });
      }
    }
    expect(findings, `\n${findings.join("\n")}\n`).toEqual([]);
  });
});
