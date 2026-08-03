import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { ensureSharedUserTablesAfterOAuth } from "@/lib/auth/bootstrapSharedUserTables";
import { oauthBackfillFullName } from "@/lib/auth/canonicalUserContact";
import { supabaseAuthCookieOptions } from "@/lib/authCookieOptions";
import { getPropertyToolsConsumerPostLoginUrl } from "@/lib/propertyToolsConsumerUrl";
import { fetchUserPortalContext } from "@/lib/rolePortalServer";
import { resolveRoleHomePath } from "@/lib/rolePortalPaths";
import { consumerShouldUsePropertyToolsApp } from "@/lib/signupOriginApp";
import { requireSupabasePublicEnv } from "@/lib/supabasePublicEnv";

/** App destinations we honor as an OAuth `next` deep-link (else pros go to their dashboard home). */
const APP_PREFIXES = [
  "/dashboard",
  "/agent",
  "/broker",
  "/account",
  "/portal",
  "/loan-broker",
  "/admin",
  "/client",
  "/propertytools/dashboard",
];

/**
 * OAuth redirect target (Google / Apple via Supabase).
 * Add this URL to Supabase Dashboard → Authentication → URL Configuration → Redirect URLs:
 *   https://<your-domain>/auth/callback
 *
 * Cookies must be set on the {@link NextResponse} so the session survives the redirect
 * (see Supabase SSR + Next.js App Router route handler pattern).
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const nextRaw = url.searchParams.get("next") ?? "/";
  const next = nextRaw.startsWith("/") && !nextRaw.startsWith("//") ? nextRaw : "/";
  const provider = url.searchParams.get("provider") ?? "";

  if (code) {
    const cookieStore = await cookies();
    const redirectUrl = new URL(next, url.origin);
    const response = NextResponse.redirect(redirectUrl);
    const { url: supabaseUrl, anonKey } = requireSupabasePublicEnv();
    const cookieOptions = supabaseAuthCookieOptions();

    const supabase = createServerClient(supabaseUrl, anonKey, {
      ...(cookieOptions ? { cookieOptions } : {}),
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet: { name: string; value: string; options: CookieOptions }[]) {
          cookiesToSet.forEach(({ name, value, options }) => {
            response.cookies.set(name, value, options);
          });
        },
      },
    });

    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) {
      console.error("[auth/callback] exchangeCodeForSession failed:", error.message, error.status);
    }
    if (!error) {
      let user = (await supabase.auth.getUser()).data.user;
      if (user?.user_metadata) {
        const meta = user.user_metadata as Record<string, unknown>;
        const backfill = oauthBackfillFullName(meta);
        if (backfill) {
          const { error: nameErr } = await supabase.auth.updateUser({ data: { full_name: backfill } });
          if (nameErr) {
            console.error("[auth/callback] oauth full_name backfill:", nameErr.message);
          } else {
            user = (await supabase.auth.getUser()).data.user ?? user;
          }
        }
      }
      if (user) {
        await ensureSharedUserTablesAfterOAuth(user, "leadsmart");
      }

      const ctx = await fetchUserPortalContext(supabase);
      if (ctx && !ctx.isPro) {
        const { data: prof } = await supabase
          .from("leadsmart_users")
          .select("oauth_onboarding_completed")
          .eq("user_id", ctx.userId)
          .maybeSingle();
        const row = prof as { oauth_onboarding_completed?: boolean | null } | null;
        const onboardingDone = row?.oauth_onboarding_completed === true;
        if (!onboardingDone) {
          const completeUrl = new URL("/agent-signup", url.origin);
          completeUrl.searchParams.set("redirect", next);
          const out = NextResponse.redirect(completeUrl);
          for (const v of response.headers.getSetCookie()) {
            out.headers.append("Set-Cookie", v);
          }
          return out;
        }
        const consumerDest = consumerShouldUsePropertyToolsApp(ctx.signupOriginApp)
          ? getPropertyToolsConsumerPostLoginUrl()
          : new URL(next, url.origin).toString();
        const out = NextResponse.redirect(consumerDest);
        for (const v of response.headers.getSetCookie()) {
          out.headers.append("Set-Cookie", v);
        }
        return out;
      }

      // Pro professionals: land them on their dashboard home. The default `next`
      // is the PUBLIC page they clicked "log in" from (usually the homepage), so
      // without this a Google/Apple sign-in bounces an agent back to the
      // marketing site instead of the portal. A genuine deep-link (next already
      // points at an app page) is still honored.
      if (ctx?.isPro) {
        const wantsAppPage = APP_PREFIXES.some((p) => next === p || next.startsWith(`${p}/`));
        const dest = wantsAppPage ? next : resolveRoleHomePath(ctx.role, ctx.hasAgentRow);
        if (dest !== next) {
          const out = NextResponse.redirect(new URL(dest, url.origin));
          for (const v of response.headers.getSetCookie()) {
            out.headers.append("Set-Cookie", v);
          }
          return out;
        }
      }
      return response;
    }
  }

  const providerQs = provider ? `&provider=${encodeURIComponent(provider)}` : "";
  return NextResponse.redirect(new URL(`/login?error=oauth${providerQs}`, url.origin));
}
