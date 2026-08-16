import "server-only";

import { cookies, headers } from "next/headers";

import { resolveLocale } from "@leadsmart/i18n";

import {
  DEFAULT_LOCALE,
  I18N_COOKIE_NAME,
  resources,
  type SupportedLocale,
} from "./config";

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
 * resources directly. Falls back to the key itself when a
 * translation is missing so missing-string regressions are
 * visible at runtime.
 *
 * Interpolation: simple `{{name}}` substitution. Matches i18next's
 * default behavior so the same string keys work on client + server.
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
  const locale = await getServerLocale();
  return (key, opts) => {
    const ns = (opts?.ns as string | undefined) ?? defaultNs;
    const bundle = resources[locale]?.[ns as keyof (typeof resources)[typeof locale]];
    if (!bundle) return key;
    const value = lookup(bundle, key);
    if (typeof value !== "string") return key;
    return interpolate(value, opts ?? {});
  };
}

function lookup(bundle: Record<string, unknown>, key: string): unknown {
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

function interpolate(template: string, vars: Record<string, unknown>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, name) => {
    const v = vars[name];
    return v == null ? "" : String(v);
  });
}
