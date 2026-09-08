/**
 * Cookie-consent state as both sides read it.
 *
 * Kept OUT of CookieConsent.tsx on purpose: that file is `"use client"`, and
 * a server component (the root layout) that imports a plain function from a
 * client module gets a runtime error, not a compile error — the first attempt
 * at rendering the banner on the server (#1655) took every page down for
 * the minutes it was deployed. This module has no directive and no React,
 * so the layout can parse the cookie and the client can share the shape.
 */
export const CONSENT_STORAGE_KEY = "ls_cookie_consent";
export const CONSENT_COOKIE_KEY = "ls_cookie_consent";
export const CONSENT_COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 365; // 1 year
export const CONSENT_VERSION = "1";

export type ConsentCategories = {
  necessary: true;
  analytics: boolean;
  marketing: boolean;
};

export type ConsentState = {
  version: string;
  acceptedAt: string;
  categories: ConsentCategories;
};

/** Parse a stored/cookie value; null for absent, malformed, or an older version. */
export function parseConsentValue(raw: string | null | undefined): ConsentState | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (parsed && typeof parsed === "object" && "version" in parsed && "categories" in parsed) {
      const state = parsed as ConsentState;
      // Discard stored state if the version has rolled forward — forces
      // re-consent when we materially change disclosure language.
      if (state.version !== CONSENT_VERSION) return null;
      return { ...state, categories: { ...state.categories, necessary: true } };
    }
  } catch {
    /* malformed — no decision */
  }
  return null;
}

/** The cookie is URL-encoded JSON (see `persist` in CookieConsent.tsx). */
export function parseConsentCookie(raw: string | null | undefined): ConsentState | null {
  if (!raw) return null;
  try {
    return parseConsentValue(decodeURIComponent(raw));
  } catch {
    return null;
  }
}
