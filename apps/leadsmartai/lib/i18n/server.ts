import "server-only";

import { cookies, headers } from "next/headers";

import { resolveLocale } from "@leadsmart/i18n";

import {
  DEFAULT_LOCALE,
  I18N_COOKIE_NAME,
  resources,
  type SupportedLocale,
} from "./config";
import { translatorFor } from "./translator";

/**
 * Server-side locale resolution for Server Components + Route
 * Handlers. Cookie wins over the Accept-Language header so an
 * agent who manually picked Chinese stays in Chinese even when
 * their browser default is English.
 *
 * Cookie is set client-side after the language picker fires —
 * see `setLocaleCookie()` in `./client.ts`.
 */
export async function getServerLocale(): Promise<SupportedLocale> {
  const cookieStore = await cookies();
  const fromCookie = resolveLocale(cookieStore.get(I18N_COOKIE_NAME)?.value);
  if (fromCookie) return fromCookie;

  const headerList = await headers();
  const accept = headerList.get("accept-language");
  if (accept) {
    // Accept-Language: "zh-CN,zh;q=0.9,en-US;q=0.8" — walk left-to-
    // right and pick the first tag we recognize.
    const tags = accept
      .split(",")
      .map((entry) => entry.split(";")[0]?.trim())
      .filter((tag): tag is string => Boolean(tag));
    for (const tag of tags) {
      const resolved = resolveLocale(tag);
      if (resolved) return resolved;
    }
  }

  return DEFAULT_LOCALE;
}

/**
 * Synchronous `t()` for Server Components. We don't spin up an
 * i18next instance on the server — just key into the bundled
 * resources directly.
 *
 * Interpolation: simple `{{name}}` substitution. Matches i18next's
 * default behavior so the same string keys work on client + server.
 *
 * RESOLUTION ORDER, and why it is not just "the key". This used to return the
 * key on any miss, on the reasoning that a visible `pages.cma.metaTitle`
 * makes a regression obvious. It does — to us. To a Chinese-speaking agent it
 * is a broken page, and the miss it exposes is usually a gap in the zh-Hans
 * bundle alone, where perfectly good English was sitting one lookup away.
 * (`useTranslation` on the client has always done this: `fallbackLng` plus
 * `defaultValue`. The server half silently didn't, so the same call rendered
 * differently either side of the boundary.)
 *
 * So: the requested locale, then `defaultValue` if the caller passed one,
 * then the default-locale bundle, and only then the key. That order lives in
 * `./resolveKey`, pure and unit-tested, because this module is `server-only`
 * and reads `next/headers` — the order is the part worth pinning, and it
 * cannot be exercised from here.
 *
 * `defaultNs` mirrors `useTranslation(ns)` on the client, and exists because
 * the asymmetry was a live bug: a component moved from the hook to this
 * translator kept its bare `t("…")` calls, which then resolved against
 * "common", missed, and rendered the raw key path on screen. Passing the
 * namespace once here keeps every call site correct — including the multi-line
 * and option-bearing calls a per-call `{ ns }` sweep silently skips.
 */
export async function getServerT(
  defaultNs = "common",
): Promise<(key: string, opts?: { ns?: string; [k: string]: unknown }) => string> {
  return translatorFor(await getServerLocale(), defaultNs);
}
