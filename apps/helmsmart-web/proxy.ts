import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { connForHost } from "@/lib/pack-host";

// Routes that require an authenticated user + an org.
const DASHBOARD_SEGMENTS = [
  "/ai-team", "/approvals", "/ask", "/automations", "/books", "/calendar", "/clients", "/command-center",
  "/home", "/inbox", "/marketing", "/pipeline", "/projects", "/reception",
  "/reports", "/settings", "/social", "/tasks", "/timesheets", "/voice",
];

// Routes only accessible when logged OUT
const AUTH_SEGMENTS = ["/login", "/signup"];

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

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
