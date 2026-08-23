import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient, hasServiceRole } from "@/lib/supabase/admin";
import {
  REFERRAL_COOKIE,
  REFERRAL_COOKIE_MAX_AGE,
  collectUtm,
  serialiseReferralCookie,
} from "@/lib/referrals";
import { hashIp } from "@/lib/ids";

/**
 * Referral entry point: /r/ABW-7K4M2X
 *
 * Records the click, drops the attribution cookie, and forwards the visitor on.
 * A failure to record must never break the visitor's journey, so every database
 * error here is swallowed after the redirect is decided.
 */
export async function GET(
  request: NextRequest,
  context: { params: Promise<{ code: string }> },
) {
  const { code: rawCode } = await context.params;
  const code = rawCode.toUpperCase().slice(0, 40);
  const url = new URL(request.url);

  // `?to=/solutions` lets a partner point a code at a specific page.
  const requestedPath = url.searchParams.get("to") ?? "/";
  const safePath = requestedPath.startsWith("/") && !requestedPath.startsWith("//")
    ? requestedPath
    : "/";

  const destination = new URL(safePath, url.origin);
  for (const [key, value] of url.searchParams) {
    if (key !== "to") destination.searchParams.set(key, value);
  }

  const response = NextResponse.redirect(destination, { status: 302 });
  response.cookies.set({
    name: REFERRAL_COOKIE,
    value: serialiseReferralCookie({
      code,
      at: new Date().toISOString(),
      landing: safePath,
      utm: collectUtm(url.searchParams),
    }),
    maxAge: REFERRAL_COOKIE_MAX_AGE,
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
  });

  if (hasServiceRole()) {
    try {
      const supabase = createAdminClient();
      const { data: referralCode } = await supabase
        .from("abw_referral_codes")
        .select("partner_id")
        .eq("code", code)
        .eq("is_active", true)
        .maybeSingle();

      await supabase.from("abw_referral_clicks").insert({
        code,
        partner_id: referralCode?.partner_id ?? null,
        landing_path: safePath,
        utm: collectUtm(url.searchParams),
        referrer: request.headers.get("referer")?.slice(0, 500) ?? null,
        ip_hash: hashIp(
          request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
        ),
        user_agent: request.headers.get("user-agent")?.slice(0, 500) ?? null,
      });
    } catch {
      // Attribution telemetry is best-effort; the cookie is what matters.
    }
  }

  return response;
}
