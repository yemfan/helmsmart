/**
 * Canonical site origin for metadata (`metadataBase`) so favicons and Open Graph URLs match the deployment host.
 *
 * **Production:** Set `NEXT_PUBLIC_SITE_URL` in Vercel (e.g. `https://www.closebossai.com`).
 * **Preview:** Uses `VERCEL_URL` when unset so icons load from the preview origin, not production.
 *
 * Values without a scheme (e.g. `closebossai.com`) are normalized to `https://…` so `new URL()` never throws.
 *
 * NOTE: leadsmart-ai.com expired — the app domain is now closebossai.com. This
 * fallback only fires when NEXT_PUBLIC_SITE_URL + VERCEL_URL are both unset.
 */
const DEFAULT_ORIGIN = "https://www.closebossai.com";

function normalizeOrigin(raw: string, fallback: string): string {
  const trimmed = raw.trim().replace(/\/$/, "");
  if (!trimmed) return fallback;
  const withScheme = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  try {
    const u = new URL(withScheme);
    if (u.protocol !== "http:" && u.protocol !== "https:") return fallback;
    return u.origin;
  } catch {
    return fallback;
  }
}

export function getSiteUrl(): string {
  const fromEnv = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (fromEnv) {
    return normalizeOrigin(fromEnv, DEFAULT_ORIGIN);
  }
  const vercel = process.env.VERCEL_URL?.trim();
  if (vercel) {
    return normalizeOrigin(`https://${vercel}`, DEFAULT_ORIGIN);
  }
  if (process.env.NODE_ENV === "development") {
    return "http://localhost:3000";
  }
  return DEFAULT_ORIGIN;
}

/**
 * Base URL for Supabase OAuth `redirectTo` (Google / Apple).
 *
 * **Always uses the current browser tab origin** on the client so Google/Apple OAuth returns to
 * this app, not Property Tools (or vice versa) when `NEXT_PUBLIC_SITE_URL` is mis-set. List each
 * origin under Supabase → Authentication → URL Configuration → Redirect URLs.
 *
 * `NEXT_PUBLIC_SITE_URL` remains for {@link getSiteUrl} (metadata, password-reset links, etc.).
 */
export function getOAuthRedirectOrigin(): string {
  if (typeof window !== "undefined") {
    return window.location.origin;
  }
  const fromEnv = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (fromEnv) {
    return normalizeOrigin(fromEnv, DEFAULT_ORIGIN);
  }
  const vercel = process.env.VERCEL_URL?.trim();
  if (vercel) {
    return normalizeOrigin(`https://${vercel}`, DEFAULT_ORIGIN);
  }
  if (process.env.NODE_ENV === "development") {
    return "http://localhost:3000";
  }
  return DEFAULT_ORIGIN;
}
