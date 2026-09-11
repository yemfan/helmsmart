import { createBrowserClient, parseCookieHeader, serializeCookieHeader, type CookieOptions } from "@supabase/ssr";
import { supabaseAuthCookieOptions } from "@/lib/authCookieOptions";
import { KEEP_SIGNED_IN_COOKIE, keepSignedInFrom, readCookieValue, withSessionLifetime } from "@/lib/auth/keepSignedIn";
import { requireSupabasePublicEnv } from "@/lib/supabasePublicEnv";

/**
 * Cookie-backed session so Server Components and `proxy.ts` see the same auth as the browser.
 *
 * The cookie methods are the library's own document.cookie behaviour with one
 * change: when the person unticked "Keep me signed in on this device", session
 * cookies are written without a lifetime, so they end when the browser closes.
 * The choice is read at every write, because this client is a singleton that
 * outlives the sign-in form.
 */
export function supabaseBrowser() {
  const { url: supabaseUrl, anonKey } = requireSupabasePublicEnv();
  const cookieOptions = supabaseAuthCookieOptions();
  return createBrowserClient(supabaseUrl, anonKey, {
    ...(cookieOptions ? { cookieOptions } : {}),
    cookies: {
      getAll() {
        if (typeof document === "undefined") return [];
        return parseCookieHeader(document.cookie).map(({ name, value }) => ({ name, value: value ?? "" }));
      },
      setAll(cookiesToSet: { name: string; value: string; options: CookieOptions }[]) {
        if (typeof document === "undefined") return;
        const keep = keepSignedInFrom(readCookieValue(document.cookie, KEEP_SIGNED_IN_COOKIE));
        for (const { name, value, options } of cookiesToSet) {
          document.cookie = serializeCookieHeader(name, value, withSessionLifetime(options, keep) ?? {});
        }
      },
    },
  });
}
