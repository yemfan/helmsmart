import { DEFAULT_LOCALE, type SupportedLocale } from "./constants";
import type { LocaleResources } from "./client";

/**
 * One locale's bundles, loaded once and shared by every render.
 *
 * The root layout used to pass the bundles to `<I18nProvider>` as a prop.
 * Props to a client component travel in the React payload, so the whole
 * English locale — 733 KB, most of it `dashboard.pages` — rode along in
 * every page's HTML (830 KB of document, 245 KB gzipped, cached by nobody).
 *
 * Now the provider `use()`s this promise instead. The bundle is a code-split
 * chunk: hashed, immutable, fetched once per deploy and served from cache on
 * every later page load. The promise carries React's `status`/`value`
 * fields, so once it has resolved `use()` returns synchronously — no
 * suspension on the server after warm-up, none in the browser after the
 * first visit.
 */
type Tracked = Promise<LocaleResources> & {
  status?: "pending" | "fulfilled" | "rejected";
  value?: LocaleResources;
  reason?: unknown;
};

const loaders: Record<SupportedLocale, () => Promise<{ default: LocaleResources }>> = {
  en: () => import("./bundles/en"),
  "zh-Hans": () => import("./bundles/zh-Hans"),
};

const cache = new Map<SupportedLocale, Tracked>();

export function loadLocaleBundle(locale: SupportedLocale): Promise<LocaleResources> {
  const key = locale in loaders ? locale : DEFAULT_LOCALE;
  let tracked = cache.get(key);
  if (!tracked) {
    const base: Tracked = loaders[key]().then((m) => m.default);
    base.status = "pending";
    base.then(
      (value) => {
        base.status = "fulfilled";
        base.value = value;
      },
      (reason: unknown) => {
        base.status = "rejected";
        base.reason = reason;
        // Let the next render try again rather than pin the failure.
        cache.delete(key);
      },
    );
    cache.set(key, base);
    tracked = base;
  }
  return tracked;
}

// On the server the modules are local, so warm both locales at start-up:
// the first request then finds a settled promise and never suspends.
if (typeof window === "undefined") {
  for (const locale of Object.keys(loaders) as SupportedLocale[]) void loadLocaleBundle(locale);
}
