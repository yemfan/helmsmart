/**
 * A client component imports no server-only code.
 *
 * `components/invoice-reminder-settings.tsx` is `"use client"` and imported
 * `createServiceClient` from `@/lib/supabase/server` without ever calling it.
 * Unused or not, an import puts the module, and everything IT imports, into the
 * browser's module graph: here the service-role client factory and
 * `next/headers`. That shape (a server import reached from a client module)
 * took production down in #1655. The build does not reliably catch it, and a
 * tree-shaken unused import can hide it until someone uses it.
 *
 * The rule: a `"use client"` module's value imports may not resolve to a
 * server-only module. A module is server-only if it imports one of
 * SERVER_ONLY_SPECIFIERS, or (through any chain of this app's own modules)
 * value-imports a module that does. Two things break the chain:
 *   - `import type` (and `import { type X }`), which are erased;
 *   - `"use server"` modules, which a client may import: it gets references to
 *     the actions, not their code.
 *
 * The i18n guard `keeps the server translator out of client modules` states one
 * case of this by name; this is the general form.
 */
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import ts from "typescript";

const ROOT = path.resolve(__dirname, "..");
const SCAN_DIRS = ["app", "lib", "components"];
/** Package specifiers whose code only works on the server. */
const SERVER_ONLY_SPECIFIERS = new Set(["next/headers", "server-only", "@helm/data/server"]);

type Import = { spec: string; target: string | null };
type Mod = { rel: string; directive: "use client" | "use server" | null; imports: Import[] };

function walk(dir: string, out: string[]) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === "node_modules" || entry.name.startsWith(".")) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (/\.(ts|tsx)$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name) && !entry.name.endsWith(".d.ts"))
      out.push(full);
  }
}

const rel = (abs: string) => path.relative(ROOT, abs).split(path.sep).join("/");

function resolveImport(fromRel: string, spec: string): string | null {
  let base: string;
  if (spec.startsWith("@/")) base = path.join(ROOT, spec.slice(2));
  else if (spec.startsWith(".")) base = path.resolve(ROOT, path.dirname(fromRel), spec);
  else return null;
  for (const cand of [base, `${base}.ts`, `${base}.tsx`, path.join(base, "index.ts"), path.join(base, "index.tsx")]) {
    if (fs.existsSync(cand) && fs.statSync(cand).isFile()) return rel(cand);
  }
  return null;
}

function isTypeOnly(st: ts.ImportDeclaration | ts.ExportDeclaration): boolean {
  if (ts.isExportDeclaration(st)) return st.isTypeOnly;
  const clause = st.importClause;
  if (!clause) return false; // `import "x"` runs x
  if (clause.isTypeOnly) return true;
  const nb = clause.namedBindings;
  return !clause.name && !!nb && ts.isNamedImports(nb) && nb.elements.length > 0 && nb.elements.every((e) => e.isTypeOnly);
}

function parse(abs: string): Mod {
  const r = rel(abs);
  const sf = ts.createSourceFile(abs, fs.readFileSync(abs, "utf8"), ts.ScriptTarget.Latest, true,
    abs.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const first = sf.statements[0];
  const text = first && ts.isExpressionStatement(first) && ts.isStringLiteral(first.expression) ? first.expression.text : "";
  const directive = text === "use client" || text === "use server" ? text : null;
  const imports: Import[] = [];
  for (const st of sf.statements) {
    if (!(ts.isImportDeclaration(st) || ts.isExportDeclaration(st))) continue;
    if (!st.moduleSpecifier || !ts.isStringLiteral(st.moduleSpecifier) || isTypeOnly(st)) continue;
    const spec = st.moduleSpecifier.text;
    imports.push({ spec, target: resolveImport(r, spec) });
  }
  return { rel: r, directive, imports };
}

const files: string[] = [];
for (const d of SCAN_DIRS) walk(path.join(ROOT, d), files);
const mods = new Map<string, Mod>(files.map((f) => [rel(f), parse(f)]));

/** Server-only module → the import that makes it so. */
const serverOnly = new Map<string, string>();
const isServerOnly = (imp: Import) =>
  SERVER_ONLY_SPECIFIERS.has(imp.spec) || (imp.target !== null && serverOnly.has(imp.target));

for (let changed = true; changed; ) {
  changed = false;
  for (const m of mods.values()) {
    if (m.directive || serverOnly.has(m.rel)) continue;
    const hit = m.imports.find(isServerOnly);
    if (hit) {
      serverOnly.set(m.rel, hit.spec);
      changed = true;
    }
  }
}

/** How a server-only module got that way, for the failure message. */
function chainOf(target: string): string {
  const seen = new Set<string>();
  const parts: string[] = [];
  let cur: string | undefined = target;
  while (cur && !seen.has(cur)) {
    seen.add(cur);
    const via: string | undefined = serverOnly.get(cur);
    parts.push(via ?? cur);
    cur = mods.get(cur)?.imports.find((i) => i.spec === via)?.target ?? undefined;
  }
  return parts.join(" → ");
}

describe("client/server import boundary", () => {
  it("sees the client modules, and knows the service client is server-only (the scan is not vacuous)", () => {
    expect([...mods.values()].filter((m) => m.directive === "use client").length).toBeGreaterThan(50);
    expect(serverOnly.has("lib/supabase/server.ts")).toBe(true);
    expect(serverOnly.has("lib/auth/org-context.ts")).toBe(true);
    // The card hashes with `crypto.subtle`; only the server reaches node:crypto.
    expect(serverOnly.has("lib/ai-team/fingerprint.server.ts")).toBe(true);
    expect(serverOnly.has("lib/ai-team/fingerprint.ts")).toBe(false);
  });

  it("no \"use client\" module value-imports server-only code", () => {
    const offenders: string[] = [];
    for (const m of mods.values()) {
      if (m.directive !== "use client") continue;
      for (const imp of m.imports) {
        if (!isServerOnly(imp)) continue;
        offenders.push(imp.target ? `${m.rel} imports ${imp.spec} (${chainOf(imp.target)})` : `${m.rel} imports ${imp.spec}`);
      }
    }
    expect(offenders, "move the server work into a \"use server\" action, or import only types").toEqual([]);
  });
});
