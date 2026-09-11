import { cookies } from "next/headers";
import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { KEEP_SIGNED_IN_COOKIE, keepSignedInFrom, withSessionLifetime } from "@/lib/auth/keepSignedIn";

export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet: { name: string; value: string; options: CookieOptions }[]) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, withSessionLifetime(options, keepSignedInFrom(cookieStore.get(KEEP_SIGNED_IN_COOKIE)?.value)))
            );
          } catch {
            // ignore in server components where cookies cannot be set
          }
        },
      },
    }
  );
}
