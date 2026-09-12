"use client";

import { usePathname, useRouter } from "next/navigation";

import { useSetLocale } from "./client";
import type { SupportedLocale } from "./config";
import { isLocalizedPath, localizedPath, splitLocalePath } from "./routing";

/**
 * Switch language, and move to the URL that language is served at.
 *
 * The cookie alone is no longer enough. On a locale-prefixed page the URL wins
 * over the cookie — deliberately, so a shared link means what it says — which
 * means a reader on `/zh/pricing` who clicks EN would have set a cookie that
 * the very next render ignores, and the page would stay Chinese. The control
 * would look broken, and the reason would be invisible.
 *
 * So: set the locale, then navigate from `/zh/pricing` to `/pricing`, or from
 * `/pricing` to `/zh/pricing`. Only for the paths published in every language —
 * on the dashboard there is nothing to navigate to and the cookie is the whole
 * mechanism, exactly as before.
 */
export function useLocaleSwitch(): (locale: SupportedLocale) => void {
  const setLocale = useSetLocale();
  const pathname = usePathname();
  const router = useRouter();

  return (locale: SupportedLocale) => {
    setLocale(locale);

    // `usePathname` reports the browser's URL, so a rewritten /zh/pricing
    // arrives here with its prefix intact — which is what has to be replaced.
    const { path } = splitLocalePath(pathname ?? "/");
    if (!isLocalizedPath(path)) return;

    const next = localizedPath(path, locale);
    if (next !== pathname) router.replace(next);
  };
}
