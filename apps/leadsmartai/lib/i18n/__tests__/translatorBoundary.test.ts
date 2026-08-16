import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Two syntactic guards on the client/server translator boundary. Both exist
 * because the i18n pass tripped over them and broke every leadsmartai build on
 * the branch — for hours, while CI stayed green, because the GitHub build check
 * points Supabase at a stub and the failure was in the module graph.
 *
 * 1. `"use client"` must be the FIRST statement.
 *
 *    The hook inserter put its import above the directive:
 *
 *        import { getServerT } from "@/lib/i18n/server";
 *
 *        "use client";
 *
 *    which is no longer a directive at all — just a string expression sitting
 *    in the middle of the module. The file silently stops being a client
 *    component. Three loan-broker pages shipped like this.
 *
 *    A leading space is fine (`  "use client";` is still the first statement)
 *    and several files have one, so this checks statement order, not column.
 *
 * 2. A client module must not import the server translator.
 *
 *    `lib/i18n/server` imports "server-only" and next/headers. Pulling it into
 *    a client module is the error that actually failed the build:
 *
 *        'server-only' cannot be imported from a Client Component module.
 *
 *    Client components use `useTranslation("dashboard")` from react-i18next.
 *
 * The inverse — a server module calling the useTranslation HOOK — is
 * deliberately not checked here. A module with no "use client" of its own is
 * legitimately part of the client graph when every importer is a client
 * component, so a syntactic rule would fire on correct code. The build catches
 * the real cases loudly ("(0 , e.createContext) is not a function").
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

const rel = (file: string) => relative(ROOT, file).split(sep).join("/");

/** Strip the leading block/line comments a directive is allowed to follow. */
function firstStatement(src: string): string {
  let s = src.replace(/^﻿/, "");
  for (;;) {
    const trimmed = s.replace(/^\s+/, "");
    if (trimmed.startsWith("/*")) {
      const end = trimmed.indexOf("*/");
      if (end === -1) return trimmed;
      s = trimmed.slice(end + 2);
      continue;
    }
    if (trimmed.startsWith("//")) {
      const end = trimmed.indexOf("\n");
      if (end === -1) return trimmed;
      s = trimmed.slice(end + 1);
      continue;
    }
    return trimmed;
  }
}

describe("i18n translator boundary", () => {
  it('declares "use client" as the first statement, or not at all', () => {
    const findings: string[] = [];

    for (const root of SCAN) {
      for (const file of walk(join(ROOT, root))) {
        const src = readFileSync(file, "utf8");
        if (!/(^|\n)\s*["']use client["'];/.test(src)) continue;
        if (/^["']use client["'];/.test(firstStatement(src))) continue;

        const line =
          src.slice(0, src.search(/\s*["']use client["'];/)).split("\n").length;
        findings.push(
          `${rel(file)}:${line}  "use client" is not the first statement — it is inert here`,
        );
      }
    }

    expect(
      findings,
      `\n"use client" only counts as a directive when nothing executable precedes it:\n${findings.join("\n")}\n`,
    ).toEqual([]);
  });

  it("keeps the server translator out of client modules", () => {
    const findings: string[] = [];

    for (const root of SCAN) {
      for (const file of walk(join(ROOT, root))) {
        const src = readFileSync(file, "utf8");
        if (!/^["']use client["'];/.test(firstStatement(src))) continue;
        if (!/from ["']@\/lib\/i18n\/server["']/.test(src)) continue;

        findings.push(
          `${rel(file)}  imports @/lib/i18n/server — use useTranslation("dashboard") instead`,
        );
      }
    }

    expect(
      findings,
      `\n@/lib/i18n/server pulls in "server-only" + next/headers and cannot be imported from a client module:\n${findings.join("\n")}\n`,
    ).toEqual([]);
  });
});
