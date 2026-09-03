import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Every `display.key` a tool emits must exist in both bundles.
 *
 * This is the failure this whole mechanism introduces. A tool names what
 * happened by key; RunCard renders it. Get the key wrong — a typo, a rename, a
 * new branch added without its translation — and i18next returns the key
 * itself, so the agent reads `tools.crm.hotLeads` where a sentence should be.
 *
 * The English `summary` is passed as `defaultValue`, so a miss degrades to the
 * old English line rather than to a raw key. That is the safety net, not the
 * plan: it hides the mistake instead of fixing it, and only in English.
 *
 * Read off the source rather than a hand-kept list. A list would be one more
 * thing to forget to update, which is the exact class of bug being guarded.
 */

const ROOT = join(__dirname, "..", "..", "..", "..");
const IMPL = join(ROOT, "lib", "boss", "tools", "impl");
const LOCALES = join(ROOT, "..", "..", "packages", "i18n", "locales");

/** `key: "a.b"` and both halves of `key: cond ? "a.b" : "c.d"`. */
function keysIn(src: string): string[] {
  const found = new Set<string>();
  for (const m of src.matchAll(/\bkey:\s*([^,\n]+)/g)) {
    for (const lit of m[1].matchAll(/"([a-z][A-Za-z]*\.[A-Za-z]+)"/g)) found.add(lit[1]);
  }
  return [...found];
}

function bundle(locale: string): Record<string, unknown> {
  return JSON.parse(readFileSync(join(LOCALES, locale, "dashboard.json"), "utf8"));
}

/** Resolve `tools.<key>`, accepting i18next's plural suffixes. */
function resolves(b: Record<string, unknown>, key: string): boolean {
  const get = (k: string): unknown =>
    k.split(".").reduce<unknown>(
      (acc, seg) => (acc && typeof acc === "object" ? (acc as Record<string, unknown>)[seg] : undefined),
      b,
    );
  if (get(`tools.${key}`) !== undefined) return true;
  return ["_one", "_other"].some((s) => get(`tools.${key}${s}`) !== undefined);
}

const used = readdirSync(IMPL)
  .filter((f) => f.endsWith(".ts"))
  .flatMap((f) => keysIn(readFileSync(join(IMPL, f), "utf8")));

describe("boss tool display keys", () => {
  it("finds keys to check at all", () => {
    // If the extraction silently matched nothing, every assertion below would
    // pass vacuously and the guard would be theatre.
    expect(used.length).toBeGreaterThan(30);
  });

  it("resolves every key in English", () => {
    const en = bundle("en");
    expect(used.filter((k) => !resolves(en, k))).toEqual([]);
  });

  it("resolves every key in Chinese", () => {
    // A key present only in English renders English on a Chinese page, which
    // is the bug this change exists to remove.
    const zh = bundle("zh-Hans");
    expect(used.filter((k) => !resolves(zh, k))).toEqual([]);
  });

  it("keeps the two bundles at parity under tools.", () => {
    const flat = (v: unknown, p = ""): string[] =>
      v && typeof v === "object"
        ? Object.entries(v as Record<string, unknown>).flatMap(([k, x]) => flat(x, `${p}${k}.`))
        : [p.slice(0, -1)];
    const en = flat((bundle("en") as { tools?: unknown }).tools).sort();
    const zh = flat((bundle("zh-Hans") as { tools?: unknown }).tools).sort();
    expect(zh).toEqual(en);
  });
});
