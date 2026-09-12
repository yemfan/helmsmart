import "server-only";

import { headers } from "next/headers";

import { getServerLocale } from "./server";
import { LOCALE_PATH_HEADER } from "./headers";
import { localeAlternates } from "./routing";
import { siteUrl } from "@/lib/site-url";

/**
 * The `alternates` block for the page currently rendering — its own canonical
 * plus every language it exists in.
 *
 * One line at each call site:
 *
 *     return { title: …, description: …, alternates: await pageAlternates("/pricing") };
 *
 * The path is passed in rather than read from the request because a Server
 * Component has no reliable view of its own route — and because being explicit
 * is what keeps this honest: the string here is the page's canonical identity,
 * and it has to match the entry in `LOCALIZED_PATHS` that the sitemap publishes.
 *
 * It must be per page. Hoisting it to the marketing layout would hand every
 * page the layout's canonical, because Next merges metadata downward and never
 * resets it — the way a whole section collapses onto one URL in the index.
 */
export async function pageAlternates(path: string) {
  const [locale, headerList] = await Promise.all([getServerLocale(), headers()]);
  // The proxy passes the unprefixed path; on a bare URL there is no header and
  // the argument is already unprefixed.
  const unprefixed = headerList.get(LOCALE_PATH_HEADER) ?? path;
  return localeAlternates(unprefixed, locale, siteUrl());
}
