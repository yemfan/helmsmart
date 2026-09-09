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
 * miss every key this app adds.
 *
 * The overlay is DEEP, exactly as `config.ts` does it. It was a shallow spread
 * in both places first, and that is a trap: adding a single
 * `actions.saved_bang` to the app's `common.json` replaced the package's whole
 * `actions` group, deleting `save`, `cancel`, `dismiss` and thirty-odd others
 * from the app at once. Every call site reading one rendered its raw key, and
 * nothing about the merge looked wrong — the bundle was still a valid object,
 * just missing forty strings. Deep merge makes a nested app group extend the
 * package's rather than replace it, so groups compose and only leaves collide.
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
  // A sibling product named on the About page, and the customer quoted in the
  // landing testimonial. A product keeps its name in either language, and so
  // does a person — translating either would misattribute it.
  "LeadSmart AI",
  "Sarah K.",
]);

export function readJson(path: string): Bundle | null {
  try {
    return JSON.parse(readFileSync(path, "utf8")) as Bundle;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw err; // a malformed bundle is a finding, not a missing one
  }
}

/** Overlay `top` onto `base` key by key, all the way down — as `config.ts` does. */
function overlay(base: Bundle, top: Bundle): Bundle {
  const out: Bundle = { ...base };
  for (const [key, value] of Object.entries(top)) {
    const existing = out[key];
    out[key] =
      isPlainObject(existing) && isPlainObject(value) ? overlay(existing, value) : value;
  }
  return out;
}

function isPlainObject(v: unknown): v is Bundle {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/** One namespace as the app resolves it, or null when no such bundle exists. */
export function loadNamespace(locale: string, ns: string): Bundle | null {
  const app = readJson(join(MESSAGES, locale, `${ns}.json`));
  if (ns !== "common") return app;
  const pkg = readJson(join(PACKAGE_LOCALES, locale, "common.json")) ?? {};
  // Mirrors `resources[locale].common` in config.ts, merge depth included.
  return { ...overlay(pkg, app ?? {}), app_name: "HelmSmart" };
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

/**
 * A `common` leaf key that comes from the shared PACKAGE half and is not
 * shadowed by this app's own `common.json`.
 *
 * Every guard that resolves keys has a self-test proving its overlay reaches
 * the package half — otherwise a broken overlay would report the whole app as
 * missing `common` keys, and the failure would read like an app problem rather
 * than a guard problem. Hardcoding a key for that is a trap: the app's
 * `common.json` may declare a group at any time, and the SHALLOW spread in
 * `config.ts` then replaces the package's whole group, so the self-test starts
 * failing for a reason that has nothing to do with the overlay wiring. So the
 * key is chosen from what is actually unshadowed.
 *
 * Since the overlay became a deep merge, a top-level group in the app's file
 * no longer hides the package's siblings — this is now conservative rather
 * than necessary, and picking from an untouched group keeps it honest either
 * way. `navLabels.test.ts` asserts the merge depth itself.
 */
export function packageOnlyCommonKey(locale = "en"): string {
  const pkg = readJson(join(PACKAGE_LOCALES, locale, "common.json"));
  const app = readJson(join(MESSAGES, locale, "common.json")) ?? {};
  if (!pkg) throw new Error(`no packages/i18n/locales/${locale}/common.json`);
  const shadowed = new Set([...Object.keys(app), "app_name"]);
  const key = leafKeys(pkg).find((k) => !shadowed.has(k.split(".")[0]));
  if (!key) {
    throw new Error(
      `every group in packages/i18n/locales/${locale}/common.json is shadowed by messages/${locale}/common.json`,
    );
  }
  return key;
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
