/**
 * How a server-side `t()` call turns a key into a string.
 *
 * Split out of the Next-bound translator — which is `server-only` and reads
 * `next/headers` — so the resolution ORDER can be tested directly.
 *
 * WHY THE ORDER MATTERS. This used to be "the locale bundle, else the key".
 * A visible `pages.cma.metaTitle` does make a regression obvious — to us. To a
 * Chinese-speaking reader it is a broken page, and the miss it exposes is
 * almost always a gap in the zh-Hans bundle ALONE, with perfectly good English
 * sitting one lookup away. `useTranslation` on the client has always done the
 * fuller thing (`fallbackLng` plus `defaultValue`); the server half silently
 * did not, so the same call rendered differently either side of the boundary.
 *
 * The loud signal for a key that exists in NO bundle is unchanged — that still
 * returns the key. What's gone is showing a key path to a reader when a
 * translation exists in another language. CI carries the rest: each app's
 * `missingKeys.test.ts` walks every literal call site into the English bundle,
 * and its parity tests hold the locales to the same key set.
 *
 * PLURALS. i18next resolves `t("items", { count })` to `items_one` /
 * `items_other` by the locale's CLDR category. The server translator never
 * did, so a server-rendered `{{count}}` line printed the raw `_one` key
 * (this is the "getServerT has no plurals" trap). When `count` is a number
 * the same suffix rule runs here, through `Intl.PluralRules`, so a key works
 * identically on both sides of the boundary. A bundle that has no plural
 * forms is unaffected: the bare key is still tried last.
 */

/** A namespace bundle: nested objects of strings, as the JSON files ship. */
export type Bundle = Record<string, unknown>;

export type ResolveInput = {
  /** The requested locale's bundle for this namespace, if it has one. */
  bundle: Bundle | undefined;
  /** The default locale's (English) bundle, or undefined when already on it. */
  fallbackBundle?: Bundle | undefined;
  /** `defaultValue` from the call site — copy the caller already holds. */
  defaultValue?: unknown;
  /** i18next-style plural selector. */
  count?: unknown;
  /** BCP-47 tag for the plural rule; en-US when absent. */
  pluralTag?: string;
};

/**
 * Resolve `key` to a template string, or null when nothing has it.
 *
 * Interpolation is the caller's job so this stays a pure lookup.
 */
export function resolveKey(key: string, input: ResolveInput): string | null {
  const candidates = pluralCandidates(key, input.count, input.pluralTag);

  for (const k of candidates) {
    const hit = lookupString(input.bundle, k);
    if (hit != null) return hit;
  }

  if (typeof input.defaultValue === "string") return input.defaultValue;

  for (const k of candidates) {
    const english = lookupString(input.fallbackBundle, k);
    if (english != null) return english;
  }

  return null;
}

/**
 * `["items_one", "items_other", "items"]` for count 1 in English; just
 * `["items"]` when there is no count. `_other` sits between the exact
 * category and the bare key because every CLDR locale has an `other` form,
 * so a bundle that only wrote `_other` (Chinese has no `one`) still resolves.
 */
export function pluralCandidates(key: string, count: unknown, tag?: string): string[] {
  if (typeof count !== "number" || Number.isNaN(count)) return [key];
  let category = "other";
  try {
    category = new Intl.PluralRules(tag || "en-US").select(count);
  } catch {
    /* unknown tag — fall through to "other" */
  }
  const out = [`${key}_${category}`];
  if (category !== "other") out.push(`${key}_other`);
  out.push(key);
  return out;
}

/** The string at `key`, or null when absent or not a string. */
export function lookupString(bundle: Bundle | undefined, key: string): string | null {
  if (!bundle) return null;
  const value = lookup(bundle, key);
  return typeof value === "string" ? value : null;
}

function lookup(bundle: Bundle, key: string): unknown {
  if (key in bundle) return bundle[key];
  // Dotted-path support — settings.json uses nested objects.
  const segments = key.split(".");
  let current: unknown = bundle;
  for (const seg of segments) {
    if (current && typeof current === "object" && seg in (current as object)) {
      current = (current as Record<string, unknown>)[seg];
    } else {
      return undefined;
    }
  }
  return current;
}

/** i18next-compatible `{{name}}` substitution. */
export function interpolate(
  template: string,
  vars: Record<string, unknown>,
): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, name) => {
    const v = vars[name];
    return v == null ? "" : String(v);
  });
}
