/**
 * "Keep me signed in on this device" — the pure half.
 *
 * The auth library writes every session cookie with a 400-day lifetime and
 * ignores a lifetime passed in cookieOptions, so the choice is applied where
 * cookies are written: the browser client, the proxy, the OAuth callback and
 * the server helpers all pass their options through withSessionLifetime.
 *
 * Ticked (the default, and what a missing preference means) changes nothing.
 * Unticked drops the lifetime, which makes them session cookies that end when
 * the browser closes. A removal (maxAge 0, or an expiry in the past) always
 * stays a removal, or signing out would leave the session behind.
 *
 * No imports: the login form, the browser client and the proxy all read it.
 */

export const KEEP_SIGNED_IN_COOKIE = "cb_keep_signed_in";

/** How long a "yes" is remembered: the same 400 days the library gives a session. */
export const KEEP_PREFERENCE_MAX_AGE = 400 * 24 * 60 * 60;

/** Missing means yes: staying signed in is the default. Only an explicit "0" opts out. */
export function keepSignedInFrom(value: string | null | undefined): boolean {
  return value !== "0";
}

export function withSessionLifetime<T extends { maxAge?: number; expires?: Date }>(options: T | undefined, keep: boolean): T | undefined {
  if (keep || !options) return options;
  if (typeof options.maxAge === "number" && options.maxAge <= 0) return options;
  if (options.expires instanceof Date && options.expires.getTime() <= Date.now()) return options;
  const { maxAge, expires, ...rest } = options;
  void maxAge;
  void expires;
  return rest as T;
}

/** One cookie's value from a Cookie header or document.cookie; null when absent. */
export function readCookieValue(header: string | null | undefined, name: string): string | null {
  if (!header) return null;
  for (const part of header.split(";")) {
    const eq = part.indexOf("=");
    if (eq < 0) continue;
    if (part.slice(0, eq).trim() !== name) continue;
    const raw = part.slice(eq + 1).trim();
    try {
      return decodeURIComponent(raw);
    } catch {
      return raw;
    }
  }
  return null;
}

/**
 * The preference cookie as a document.cookie string. "Yes" is remembered for
 * 400 days; "no" is itself a session cookie, so once the browser closes the
 * next sign-in starts from the default again, as the session did.
 */
export function keepSignedInCookie(keep: boolean, opts: { secure?: boolean; domain?: string } = {}): string {
  const parts = [`${KEEP_SIGNED_IN_COOKIE}=${keep ? "1" : "0"}`, "Path=/", "SameSite=Lax"];
  if (keep) parts.push(`Max-Age=${KEEP_PREFERENCE_MAX_AGE}`);
  if (opts.domain) parts.push(`Domain=${opts.domain}`);
  if (opts.secure) parts.push("Secure");
  return parts.join("; ");
}
