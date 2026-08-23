import { NextResponse, type NextRequest } from "next/server";
import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { supabaseAuthCookieOptions } from "@/lib/authCookieOptions";
import { PRODUCT_LEADSMART_AGENT } from "@/lib/entitlements/product";
import { getPropertyToolsConsumerPostLoginUrl } from "@/lib/propertyToolsConsumerUrl";
import { getSupabasePublicEnv } from "@/lib/supabasePublicEnv";
import { fetchUserPortalContext } from "@/lib/rolePortalServer";
import { consumerShouldUsePropertyToolsApp } from "@/lib/signupOriginApp";
import { matchesPortalKind } from "@/lib/rolePortalPaths";

/** Public marketing pages under /agent/* that bypass the auth gate.
 *  Keep in sync with the matching set in app/agent/layout.tsx. */
const PUBLIC_AGENT_PATHS = new Set<string>([
  "/agent/compare",
  "/agent/pricing",
  "/agent/coaching",
]);

function isAgentPath(pathname: string) {
  if (PUBLIC_AGENT_PATHS.has(pathname)) return false;
  return pathname === "/agent" || pathname.startsWith("/agent/");
}

/**
 * `/support` itself is a public help page — FAQ + contact form (TVR-011 /
 * BF-037 found that gating the bare `/support` route created a paradox
 * where users who couldn't log in had no way to reach support). Keep
 * the gate scoped to the admin/support back-office tree under
 * `/support/dashboard/*` only.
 */
function isSupportPath(pathname: string) {
  return pathname.startsWith("/support/dashboard");
}

function isAdminPath(pathname: string) {
  return pathname === "/admin" || pathname.startsWith("/admin/");
}

function isAuthPage(pathname: string) {
  return ["/login", "/signup"].includes(pathname);
}

/**
 * Next.js 16+: `proxy.ts` replaces `middleware.ts` (same edge behavior).
 * @see https://nextjs.org/docs/app/api-reference/file-conventions/proxy
 */
export async function proxy(req: NextRequest) {
  const env = getSupabasePublicEnv();

  const pathname = req.nextUrl.pathname;
  const search = req.nextUrl.search;

  const protectedPath =
    pathname.startsWith("/dashboard") ||
    pathname.startsWith("/broker") ||
    pathname === "/portal" ||
    pathname.startsWith("/portal/") ||
    isAgentPath(pathname) ||
    isSupportPath(pathname) ||
    isAdminPath(pathname) ||
    pathname.startsWith("/account/") ||
    pathname.startsWith("/client/") ||
    pathname.startsWith("/propertytools/dashboard");

  if (!env) {
    console.warn(
      "[leadsmartai proxy] Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY — add apps/leadsmartai/.env.local (see .env.example)."
    );
    if (protectedPath) {
      const url = req.nextUrl.clone();
      url.pathname = "/login";
      url.searchParams.set("redirect", pathname);
      return NextResponse.redirect(url);
    }
    return NextResponse.next();
  }

  // Forward the resolved pathname to server components so layouts
  // can branch on it (e.g. /agent/layout.tsx skips the workspace
  // access check for public marketing pages like /agent/compare).
  const forwardedHeaders = new Headers(req.headers);
  forwardedHeaders.set("x-pathname", pathname);

  let res = NextResponse.next({
    request: {
      headers: forwardedHeaders,
    },
  });

  const cookieOptions = supabaseAuthCookieOptions();

  const supabase = createServerClient(env.url, env.anonKey, {
    ...(cookieOptions ? { cookieOptions } : {}),
    cookies: {
      getAll() {
        return req.cookies.getAll();
      },
      setAll(cookiesToSet: { name: string; value: string; options: CookieOptions }[]) {
        cookiesToSet.forEach(({ name, value, options }) => {
          res.cookies.set(name, value, options);
        });
      },
    },
  });

  // Verify the JWT LOCALLY (cached JWKS) instead of calling GoTrue's /user on
  // every request. getUser() per request — multiplied by RSC prefetches — was
  // flooding the Auth server + DB and exhausting the connection pool (login
  // outages). getClaims() verifies the token signature locally when the project
  // uses asymmetric JWT signing keys; it only falls back to a server call on a
  // legacy secret. We additionally fall back to getUser() when the token can't
  // be verified locally (expired/invalid) — that path also refreshes the cookie,
  // preserving the previous session-refresh behavior for edge cases.
  let userId: string | null = null;
  {
    const { data: claimsData } = await supabase.auth.getClaims();
    const sub = claimsData?.claims?.sub;
    if (sub) {
      userId = String(sub);
    } else {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      userId = user?.id ?? null;
    }
  }

  if (protectedPath && !userId) {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", `${pathname}${search || ""}`);
    return NextResponse.redirect(url);
  }

  // Consumers: PropertyTools-first accounts → PropertyTools app; LeadSmart-first → stay (except pro-only areas).
  if (userId && protectedPath) {
    const ctx = await fetchUserPortalContext(supabase);
    if (ctx && !ctx.isPro) {
      if (consumerShouldUsePropertyToolsApp(ctx.signupOriginApp)) {
        return NextResponse.redirect(getPropertyToolsConsumerPostLoginUrl());
      }
      if (pathname.startsWith("/account/")) {
        return res;
      }
      const home = req.nextUrl.clone();
      home.pathname = "/";
      home.search = "";
      return NextResponse.redirect(home);
    }
  }

  if (isAuthPage(pathname) && userId) {
    const ctx = await fetchUserPortalContext(supabase);
    if (ctx && !ctx.isPro && consumerShouldUsePropertyToolsApp(ctx.signupOriginApp)) {
      return NextResponse.redirect(getPropertyToolsConsumerPostLoginUrl());
    }
    const url = req.nextUrl.clone();
    url.pathname = "/dashboard-router";
    url.search = "";
    return NextResponse.redirect(url);
  }

  // Strict admin / support trees — only `admin` + `support` roles (layout uses `ensurePortalAccess("admin")`)
  if ((isAdminPath(pathname) || isSupportPath(pathname)) && userId) {
    const { data: adminProfile } = await supabase
      .from("leadsmart_users")
      .select("role")
      .eq("user_id", userId)
      .maybeSingle();

    const adminRole = adminProfile?.role ?? null;
    if (!matchesPortalKind(adminRole, "admin")) {
      const url = req.nextUrl.clone();
      url.pathname = "/unauthorized";
      url.search = "";
      return NextResponse.redirect(url);
    }
  }

  // Soft entitlement redirect for agent workspace (aligns with `hasAgentWorkspaceAccess` admin bypass)
  if (isAgentPath(pathname) && userId) {
    const { data: profile } = await supabase
      .from("leadsmart_users")
      .select("role")
      .eq("user_id", userId)
      .maybeSingle();

    const role = String(profile?.role ?? "").toLowerCase().trim();
    if (role === "admin") {
      return res;
    }

    const { data: entitlement } = await supabase
      .from("active_product_entitlements")
      .select("id, product, is_active")
      .eq("user_id", userId)
      .eq("product", PRODUCT_LEADSMART_AGENT)
      .maybeSingle();

    if (!entitlement) {
      const url = req.nextUrl.clone();
      url.pathname = "/start-free/agent";
      url.search = "";
      return NextResponse.redirect(url);
    }
  }

  return res;
}

export const config = {
  matcher: [
    "/dashboard/:path*",
    "/broker",
    "/broker/:path*",
    "/portal",
    "/portal/:path*",
    "/agent",
    "/agent/:path*",
    "/support",
    "/support/:path*",
    "/admin",
    "/admin/:path*",
    "/account/:path*",
    "/client/:path*",
    "/propertytools/dashboard/:path*",
    "/login",
    "/signup",
    "/forgot-password",
    "/reset-password",
    "/auth/:path*",
  ],
};
