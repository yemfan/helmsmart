import type { CookieOptionsWithName } from "@supabase/ssr";

/** Suffix for `cookieOptions.name` — must differ from CloseBoss so sessions stay isolated. */
const APP_AUTH_TAG = "propertytools";

/**
 * Derives the Supabase project id used in default auth storage keys (`sb-<ref>-auth-token`).
 */
function supabaseProjectRef(): string {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  try {
    const u = new URL(url);
    if (u.hostname.endsWith(".supabase.co")) {
      return u.hostname.split(".")[0] || "project";
    }
    return u.hostname.replace(/\./g, "-") || "project";
  } catch {
    return "project";
  }
}

/**
 * Cookie options for `@supabase/ssr`.
 *
 * **Default (isolated sessions):** sets a unique `name` so Property Tools and CloseBoss
 * each keep their own login, even with the same Supabase project and
 * `NEXT_PUBLIC_AUTH_COOKIE_DOMAIN` (subdomains).
 *
 * **Shared SSO (opt-in):** set `NEXT_PUBLIC_SUPABASE_SHARED_AUTH=true` **and**
 * `NEXT_PUBLIC_AUTH_COOKIE_DOMAIN=.yourdomain.com` in **both** apps so they use the
 * default storage key and share one session across subdomains.
 *
 * @see docs/SHARED_AUTH.md (repo root)
 */
export function supabaseAuthCookieOptions(): CookieOptionsWithName | undefined {
  const shared = process.env.NEXT_PUBLIC_SUPABASE_SHARED_AUTH === "true";
  const domain = process.env.NEXT_PUBLIC_AUTH_COOKIE_DOMAIN?.trim();

  const base: CookieOptionsWithName = {
    path: "/",
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    ...(domain ? { domain } : {}),
  };

  if (shared) {
    if (!domain) return undefined;
    return base;
  }

  const ref = supabaseProjectRef();
  return {
    ...base,
    name: `sb-${ref}-auth-token-${APP_AUTH_TAG}`,
  };
}
