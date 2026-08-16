import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * A server page that forgets the namespace renders the KEY.
 *
 * `getServerT()` defaults to the "common" namespace and returns the key
 * unchanged when the lookup misses, so `t("pages.foo.bar")` in a server
 * component puts the literal text `pages.foo.bar` on the screen. Every page
 * copy key lives in the `dashboard` namespace, so every one of these calls
 * needs `{ ns: "dashboard" }`.
 *
 * This shipped on 11 server files, including the Meta data-deletion status
 * page — which exists so that someone chasing down their own data sees a
 * sensible message rather than a 404, and was instead showing them a key.
 *
 * No other check here could catch it. The residual-English scan looks for
 * English, and a raw key is not English; the parity checks compare the locale
 * files to each other and never look at a call site. It is the failure mode
 * that looks *most* like success from the outside — the page is fully wired
 * for translation, and renders neither language.
 *
 * Client components are exempt: `useTranslation("dashboard")` binds the
 * namespace once, at the hook.
 */

const ROOT = join(__dirname, "..", "..", "..");
const SCAN = ["app", "components", "lib"];

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) {
      if (name !== "node_modules" && name !== "__tests__") walk(p, out);
    } else if (p.endsWith(".tsx") || p.endsWith(".ts")) out.push(p);
  }
  return out;
}

/** End index of the object literal opening at `open`, or -1 if unterminated. */
function objectEnd(src: string, open: number): number {
  let depth = 0;
  for (let i = open; i < src.length; i++) {
    if (src[i] === "{") depth++;
    else if (src[i] === "}" && --depth === 0) return i;
  }
  return -1;
}

describe("server translator namespace", () => {
  it("passes ns: \"dashboard\" on every server-side pages.* lookup", () => {
    const findings: string[] = [];

    for (const root of SCAN) {
      for (const file of walk(join(ROOT, root))) {
        const src = readFileSync(file, "utf8");
        if (/^\s*"use client";/m.test(src)) continue;
        if (!/getServerT/.test(src)) continue;

        for (const m of src.matchAll(/(?<![\w.])tr?\("(pages\.[^"]+)"/g)) {
          const after = (m.index ?? 0) + m[0].length;
          const rest = src.slice(after);
          const gap = rest.match(/^\s*/)?.[0].length ?? 0;

          let hasNs = false;
          if (rest[gap] === ",") {
            const brace = rest.indexOf("{", gap);
            const end = brace < 0 ? -1 : objectEnd(rest, brace);
            hasNs = end >= 0 && /\bns\s*:/.test(rest.slice(brace, end + 1));
          }
          if (hasNs) continue;

          const line = src.slice(0, after).split("\n").length;
          const rel = relative(ROOT, file).split(sep).join("/");
          findings.push(`${rel}:${line}  ${m[1]}`);
        }
      }
    }

    expect(
      findings,
      `\nServer t() without ns: "dashboard" — these render the key, not the copy:\n${findings.join("\n")}\n`,
    ).toEqual([]);
  });
});
