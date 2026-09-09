import { DEFAULT_LOCALE, type SupportedLocale } from "./constants";
import type { LocaleResources } from "./client";
import type { RouteGroup } from "./routeGroups";

/**
 * One route group's bundles for one locale, loaded once and shared.
 *
 * The root layout used to pass every namespace to `<I18nProvider>` as a prop.
 * Props to a client component travel in the React payload, so the whole
 * locale rode along in every page's HTML (830 KB of document, 245 KB
 * gzipped, cached by nobody).
 *
 * Now the provider `use()`s this promise, and asks for its route group only:
 * a public page does not download the 364 KB `dashboard` namespace, and a
 * signed-in one does not download the 300 KB of SEO and calculator copy.
 * 904 KB became 446 KB for the public site and 448 KB for the dashboard.
 *
 * Each is a code-split chunk: hashed, immutable, fetched once per deploy and
 * served from cache afterwards. The promise carries React's status/value
 * fields, so once it has resolved `use()` returns synchronously — no
 * suspension on the server after warm-up, none in the browser after the first
 * visit. Crossing between the two halves suspends inside Next's navigation
 * transition, which keeps the current page on screen until the other chunk
 * lands; `initClientI18n` then adds it alongside what is already loaded
 * rather than replacing it.
 */
type Tracked = Promise<LocaleResources> & {
  status?: "pending" | "fulfilled" | "rejected";
  value?: LocaleResources;
  reason?: unknown;
};

type Loader = () => Promise<{ default: LocaleResources }>;

const loaders: Record<SupportedLocale, Record<RouteGroup, Loader>> = {
  en: {
    app: () => import("./bundles/en.app"),
    web: () => import("./bundles/en.web"),
  },
  "zh-Hans": {
    app: () => import("./bundles/zh-Hans.app"),
    web: () => import("./bundles/zh-Hans.web"),
  },
};

const cache = new Map<string, Tracked>();

export function loadLocaleBundle(
  locale: SupportedLocale,
  group: RouteGroup,
): Promise<LocaleResources> {
  const loc = locale in loaders ? locale : DEFAULT_LOCALE;
  const key = loc + ":" + group;
  let tracked = cache.get(key);
  if (!tracked) {
    const base: Tracked = loaders[loc][group]().then((m) => m.default);
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

// On the server the modules are local, so warm every locale and group at
// start-up: the first request then finds a settled promise and never suspends.
if (typeof window === "undefined") {
  for (const locale of Object.keys(loaders) as SupportedLocale[]) {
    for (const group of ["app", "web"] as RouteGroup[]) void loadLocaleBundle(locale, group);
  }
}
