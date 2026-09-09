import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

/**
 * Test-only access to HelmSmart's bundles, the way `lib/i18n/config.ts`
 * assembles them.
 *
 * NOT a test. Vitest only collects `*.test.ts`; this is the one fact the
 * guards in this directory must agree on and must not each re-derive:
 *
 *   `common` is the shared package's `packages/i18n/locales/<locale>/common.json`
 *   overlaid with this app's `messages/<locale>/common.json`, app key winning,
 *   `app_name` always "HelmSmart".
 *
 * Every other namespace is one file under `messages/<locale>/`. A guard that
 * read only `messages/` would report `t("actions.save")` as missing when it
 * resolves fine through the package half; one that read only the package would
 * miss every key this app adds. The overlay is SHALLOW — a spread, exactly as
 * `config.ts` does it — so an app `common.json` that declares its own
 * `actions: {…}` replaces the package's whole `actions` group rather than
 * merging into it. `navLabels.test.ts` asserts that never happens.
 *
 * Reads from disk rather than importing `config.ts` so a bundle another agent
 * has left mid-edit fails ONE guard with a JSON error at a path, not every
 * guard at module load.
 */

/** apps/helmsmart-web */
export const ROOT = join(__dirname, "..", "..", "..");
export const MESSAGES = join(ROOT, "messages");
export const PACKAGE_LOCALES = join(ROOT, "..", "..", "packages", "i18n", "locales");

export type Bundle = Record<string, unknown>;

/**
 * Proper nouns that are correct as-is in every language. Shared by the scans
 * that read source (`residualEnglish`, `jsxExpressionEnglish`) and the one
 * that reads bundle values (`untranslatedValues`), so the three cannot
 * disagree about whether "Google Business" is English.
 *
 * Product and people names first — Tim, Emma, Alex, Emily and Mark are the AI
 * employees, and a person is called by their name in either language. Then
 * the third-party services HelmSmart connects to, which a Chinese-speaking
 * owner searches for in the Latin spelling. Then the acronyms an owner reads
 * as acronyms (PDF, CSV, SMS) and the key cap that is printed on the keyboard
 * the same way everywhere (Esc).
 */
export const PROPER_NOUNS = new Set([
  "HelmSmart",
  "Tim",
  "Emma",
  "Alex",
  "Emily",
  "Mark",
  "Google",
  "Google Business",
  "Stripe",
  "Plaid",
  "Twilio",
  "Slack",
  "QuickBooks",
  "Resend",
  "Retell",
  "PDF",
  "CSV",
  "OFX",
  "SMS",
  "Esc",
  "URL",
  "API",
  "AI",
]);

export function readJson(path: string): Bundle | null {
  try {
    return JSON.parse(readFileSync(path, "utf8")) as Bundle;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw err; // a malformed bundle is a finding, not a missing one
  }
}

/** One namespace as the app resolves it, or null when no such bundle exists. */
export function loadNamespace(locale: string, ns: string): Bundle | null {
  const app = readJson(join(MESSAGES, locale, `${ns}.json`));
  if (ns !== "common") return app;
  const pkg = readJson(join(PACKAGE_LOCALES, locale, "common.json")) ?? {};
  // Mirrors `resources[locale].common` in config.ts, spread order included.
  return { ...pkg, ...(app ?? {}), app_name: "HelmSmart" };
}

/** The namespaces that have a file on disk for `locale`, in resolved form. */
export function loadNamespaces(locale: string): Record<string, Bundle> {
  const out: Record<string, Bundle> = {};
  for (const f of readdirSync(join(MESSAGES, locale))) {
    if (!f.endsWith(".json")) continue;
    const ns = f.replace(/\.json$/, "");
    const b = loadNamespace(locale, ns);
    if (b) out[ns] = b;
  }
  return out;
}

/** The value at a dotted path, or undefined. */
export function lookup(bundle: Bundle | null | undefined, key: string): unknown {
  if (!bundle) return undefined;
  if (key in bundle) return bundle[key]; // a top-level key may contain a dot or a space
  return key.split(".").reduce<unknown>(
    (acc, seg) =>
      acc && typeof acc === "object" ? (acc as Record<string, unknown>)[seg] : undefined,
    bundle,
  );
}

/**
 * i18next stores a countable string under suffixed siblings — `items_one`,
 * `items_other` — and picks between them at render from the `count` option.
 * So `t("items", { count })` is correct even though `items` itself does not
 * exist, and a resolver that did not know this would punish every correct
 * plural.
 */
export const PLURAL_SUFFIXES = ["_one", "_other", "_zero", "_two", "_few", "_many"];

/** Does `key` resolve in `bundle`, as a leaf or as a plural family? */
export function resolvesIn(bundle: Bundle | null | undefined, key: string): boolean {
  if (lookup(bundle, key) !== undefined) return true;
  return PLURAL_SUFFIXES.some((s) => lookup(bundle, key + s) !== undefined);
}

/** Flatten a nested bundle to dotted leaf paths, so nesting cannot hide a gap. */
export function leafKeys(obj: Bundle, prefix = ""): string[] {
  return Object.entries(obj).flatMap(([k, v]) =>
    v && typeof v === "object" && !Array.isArray(v)
      ? leafKeys(v as Bundle, `${prefix}${k}.`)
      : [`${prefix}${k}`],
  );
}
