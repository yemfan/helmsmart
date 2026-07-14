"use client";

import { useEffect } from "react";

const STORAGE_KEY = "rb_attribution_v1";
const UTM_KEYS = [
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_term",
  "utm_content",
] as const;

export type SignupAttribution = {
  utm_source?: string;
  utm_medium?: string;
  utm_campaign?: string;
  utm_term?: string;
  utm_content?: string;
  /** Google / Meta click ids. */
  gclid?: string;
  fbclid?: string;
  /** External referrer URL (same-origin referrers are ignored). */
  referrer?: string;
  /** First path (+query) the visitor landed on. */
  landing_path?: string;
  /** ISO timestamp of first touch. */
  first_seen_at?: string;
};

/**
 * First-touch attribution capture. On the visitor's first page load we record
 * where they came from (utm params, click ids, external referrer, landing page)
 * into localStorage, so the signup form can stamp it onto the new account. Since
 * signups today carry NO source at all, this is how "where are they coming
 * from?" becomes answerable going forward.
 *
 * First-touch wins: once stashed, we never overwrite — the original source
 * survives later internal navigation. Invisible, no markup. Mount at the root.
 */
export function AttributionCapture() {
  useEffect(() => {
    try {
      if (window.localStorage.getItem(STORAGE_KEY)) return; // first-touch wins
      const url = new URL(window.location.href);
      const p = url.searchParams;
      const attr: SignupAttribution = {};

      for (const k of UTM_KEYS) {
        const v = p.get(k);
        if (v) (attr as Record<string, string>)[k] = v.slice(0, 200);
      }
      const gclid = p.get("gclid");
      if (gclid) attr.gclid = gclid.slice(0, 200);
      const fbclid = p.get("fbclid");
      if (fbclid) attr.fbclid = fbclid.slice(0, 200);

      // Only keep an EXTERNAL referrer — internal navigation isn't a source.
      const ref = document.referrer || "";
      if (ref) {
        try {
          if (new URL(ref).host !== url.host) attr.referrer = ref.slice(0, 300);
        } catch {
          /* malformed referrer — skip */
        }
      }

      attr.landing_path = (url.pathname + url.search).slice(0, 300);
      attr.first_seen_at = new Date().toISOString();

      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(attr));
    } catch {
      /* localStorage disabled or SSR — no-op */
    }
  }, []);
  return null;
}

/** Read the stashed attribution without clearing it (use at signup write time). */
export function readSignupAttribution(): SignupAttribution | null {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as SignupAttribution) : null;
  } catch {
    return null;
  }
}

/** Clear the stash after a successful signup so a later account in the same
 *  browser doesn't inherit this visitor's source. */
export function clearSignupAttribution(): void {
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
}
