import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { connForHost } from "@/lib/pack-host";
import {
  isLocalizedPath,
  localizedPath,
  negotiateLocale,
  splitLocalePath,
} from "@/lib/i18n/routing";
import { DEFAULT_LOCALE, I18N_COOKIE_NAME } from "@/lib/i18n/config";
import { LOCALE_HEADER, LOCALE_PATH_HEADER } from "@/lib/i18n/headers";

// Routes that require an authenticated user + an org.
const DASHBOARD_SEGMENTS = [
  "/ai-team", "/approvals", "/ask", "/automations", "/books", "/calendar", "/clients", "/command-center",
  "/home", "/inbox", "/marketing", "/pipeline", "/projects", "/reception",
  "/reports", "/settings", "/setup", "/social", "/tasks", "/timesheets", "/voice",
];

// Routes only accessible when logged OUT
const AUTH_SEGMENTS = ["/login", "/signup"];

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  /*
   * Locale-prefixed marketing URLs: /zh/pricing renders /pricing in Chinese.
   *
   * A REWRITE, not a redirect — the reader keeps the URL they followed, and one
   * route tree serves all three languages. The locale travels as a request
   * header that `getServerLocale()` checks before the cookie, so a Chinese link
   * opens in Chinese even for someone whose last visit set the cookie to
   * English. The unprefixed path is passed along too, because a page needs it
   * to name its own canonical and its `hreflang` siblings.
   *
   * ONLY FOR PUBLISHED LOCALIZED PATHS. This branch returns early, before the
   * auth guards below, so accepting any prefixed path here would let /zh/home
   * rewrite to /home and skip the dashboard check entirely — an auth bypass
   * spelled with a language prefix. `isLocalizedPath` confines it to the public
   * marketing pages the sitemap actually advertises; /zh/home stays a 404,
   * which is what it should be.
   */
  const { locale, path } = splitLocalePath(pathname);
  if (isLocalizedPath(path)) {
    /*
     * One language per URL.
     *
     * This began as an attempt to make these pages cacheable, and that half did
     * not work — see the note below. What it does achieve stands on its own: the
     * language of a marketing page is decided by its URL and nothing else, so a
     * link a reader copies out of the address bar opens the same way for whoever
     * they send it to.
     *
     * The language is decided by the URL and nothing else here:
     *
     *   /zh/pricing   renders Chinese, always, for everyone
     *   /pricing      renders the DEFAULT locale, always, for everyone
     *
     * and a reader who wants another language is sent to their own URL first.
     * The locale header is set on BOTH branches, including the bare one — that
     * is what stops the cookie from varying a cached response, because
     * `getServerLocale()` reads the header before the cookie. Elsewhere in the
     * app there is no header and the cookie still decides, which is what the
     * dashboard needs.
     *
     * WHY THESE ARE STILL NOT CACHED. Every response here is now identical for
     * every reader of a given URL, which is the hard precondition for a shared
     * cache — and it is still not enough. Setting `Cache-Control` on the
     * responses below has no effect on Vercel: for a rewrite or a pass-through
     * the rendered route supplies the response, and a dynamic route's own
     * `private, no-store` wins. Middleware headers only stick on responses
     * middleware GENERATES, which is why the 307 below really does carry
     * `no-store`.
     *
     * Measured both ways, which is the only reason this is stated rather than
     * assumed: a self-hosted `next start` keeps the middleware header, and
     * Vercel does not. The header was tried, shipped, observed inert in
     * production, and removed.
     *
     * The real fix is to stop these routes being dynamic, and they are dynamic
     * because the ROOT LAYOUT reads the locale cookie. Moving the locale into a
     * route segment (`app/[locale]/…`) would let them prerender per language and
     * be cached properly. That is a route-tree refactor, not a header, and it is
     * worth doing on its own terms. `export const revalidate` is NOT the
     * shortcut: combined with a root layout that reads cookies it has already
     * taken this app down once in production.
     */
    if (locale) {
      const url = request.nextUrl.clone();
      url.pathname = path;
      const headers = new Headers(request.headers);
      headers.set(LOCALE_HEADER, locale);
      headers.set(LOCALE_PATH_HEADER, path);
      return NextResponse.rewrite(url, { request: { headers } });
    }

    // A bare path. Does this reader want a language that has its own URL?
    const preferred =
      negotiateLocale(request.cookies.get(I18N_COOKIE_NAME)?.value ?? null) ??
      negotiateLocale(request.headers.get("accept-language"));

    if (preferred && preferred !== DEFAULT_LOCALE) {
      // 307, not 301: this depends on the reader, not on the resource, and the
      // bare URL stays the canonical English page. `no-store` because the
      // decision is per-reader and must never be cached for the next one.
      const target = request.nextUrl.clone();
      target.pathname = localizedPath(path, preferred);
      const redirect = NextResponse.redirect(target, 307);
      redirect.headers.set("Cache-Control", "private, no-store");
      return redirect;
    }

    const headers = new Headers(request.headers);
    headers.set(LOCALE_HEADER, DEFAULT_LOCALE);
    headers.set(LOCALE_PATH_HEADER, path);
    return NextResponse.next({ request: { headers } });
  }

  let response = NextResponse.next({ request });

  // Pack-aware auth: medical.* hosts authenticate against the medical Supabase
  // (its own auth island); every other host uses Core. Auth cookies are keyed by
  // project ref, so sessions never cross verticals.
  const conn = connForHost(request.headers.get("host") ?? "");
  const supabase = createServerClient(
    conn?.url ?? "https://vpmwsnoosuiknyzdxgtk.supabase.co",
    conn?.key ??
      (process.env.NEXT_PUBLIC_HELM_SUPABASE_ANON_KEY ||
        process.env.NEXT_PUBLIC_SMBAI_SUPABASE_ANON_KEY ||
        "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZwbXdzbm9vc3Vpa255emR4Z3RrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk4NDU5MTgsImV4cCI6MjA5NTQyMTkxOH0.eAn1vPTAHXj_4OMd9T50LcazrxnvMxkcfFs-de98SNg"),
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (cookiesToSet: { name: string; value: string; options: CookieOptions }[]) => {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  const { data: { user } } = await supabase.auth.getUser();

  const isDashboard = DASHBOARD_SEGMENTS.some((seg) => pathname.startsWith(seg));
  const isAuth      = AUTH_SEGMENTS.some((seg) => pathname.startsWith(seg));
  const isOnboarding = pathname.startsWith("/onboarding");

  // Accept both old (smbai-org-id) and new (helmsmart-org-id) cookie names
  const orgId =
    request.cookies.get("helmsmart-org-id")?.value ||
    request.cookies.get("smbai-org-id")?.value;

  // ── Dashboard routes ─────────────────────────────────────────────────────
  if (isDashboard) {
    if (!user) return NextResponse.redirect(new URL("/login", request.url));
    if (!orgId) return NextResponse.redirect(new URL("/onboarding", request.url));
  }

  // ── Onboarding route ─────────────────────────────────────────────────────
  if (isOnboarding && !user) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  // ── Auth routes (login / signup) ─────────────────────────────────────────
  if (isAuth && user) {
    return NextResponse.redirect(new URL(orgId ? "/home" : "/onboarding", request.url));
  }

  return response;
}

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon\\.ico|.*\\.(?:png|svg|jpg|jpeg|webp)$).*)"],
};
