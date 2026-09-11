import { cookies } from "next/headers";
import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { supabaseAuthCookieOptions } from "@/lib/authCookieOptions";
import { KEEP_SIGNED_IN_COOKIE, keepSignedInFrom, withSessionLifetime } from "@/lib/auth/keepSignedIn";
import { requireSupabasePublicEnv } from "@/lib/supabasePublicEnv";

export function supabaseServerClient() {
  // In some Next.js versions/configs, `cookies()` can be a Promise.
  // We must not access properties on it synchronously.
  const cookieStorePromise = cookies();
  const { url: supabaseUrl, anonKey } = requireSupabasePublicEnv();
  const cookieOptions = supabaseAuthCookieOptions();

  return createServerClient(supabaseUrl, anonKey, {
    ...(cookieOptions ? { cookieOptions } : {}),
    cookies: {
      async getAll() {
        const cookieStore = await cookieStorePromise;
        const anyStore = cookieStore as any;

        // Next.js cookie APIs differ slightly across versions.
        // Prefer getAll() when available.
        if (typeof anyStore.getAll === "function") {
          return anyStore.getAll();
        }

        // Fallback: cookie store is iterable in some Next versions.
        try {
          const iterable = anyStore?.[Symbol.iterator];
          if (typeof iterable === "function") {
            const result: Array<{ name: string; value: string }> = [];
            for (const c of anyStore as any) {
              if (!c) continue;
              if (typeof c.name === "string" && typeof c.value !== "undefined") {
                result.push({ name: c.name, value: c.value });
              }
            }
            return result;
          }
        } catch {
          // Ignore and fall through
        }

        return [];
      },
      async setAll(cookiesToSet: { name: string; value: string; options: CookieOptions }[]) {
        try {
          const cookieStore = await cookieStorePromise;
          cookiesToSet.forEach(({ name, value, options }) => {
            // `cookies()` in route handlers supports set(). In some contexts it might not.
            const keep = keepSignedInFrom(cookieStore.get?.(KEEP_SIGNED_IN_COOKIE)?.value);
            cookieStore.set?.(name, value, withSessionLifetime(options, keep));
          });
        } catch {
          // Server Components may throw when setting cookies; ignore.
        }
      },
    },
  });
}

