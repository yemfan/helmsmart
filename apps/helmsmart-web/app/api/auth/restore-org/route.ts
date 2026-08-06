import { createClient } from "@/lib/supabase/server";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const ORG_COOKIE = "helmsmart-org-id";

/**
 * Restores the helmsmart-org-id cookie when it's missing but the user has an
 * existing org membership in the DB.  Called by the onboarding server
 * component when it detects the cookie is absent.
 *
 * GET /api/auth/restore-org?org_id=<uuid>
 *
 * Validates that the authenticated user is actually a member of the
 * given org before setting the cookie.
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const orgId = searchParams.get("org_id");

  if (!orgId) {
    return NextResponse.redirect(`${origin}/onboarding`);
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.redirect(`${origin}/login`);
  }

  // Confirm membership before trusting the org_id param
  const { data: member } = await supabase
    .from("organization_members")
    .select("organization_id")
    .eq("user_id", user.id)
    .eq("organization_id", orgId)
    .maybeSingle();

  if (!member) {
    // Param was spoofed or user has no membership — send to onboarding
    return NextResponse.redirect(`${origin}/onboarding`);
  }

  const cookieStore = await cookies();
  cookieStore.set(ORG_COOKIE, orgId, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    maxAge: 60 * 60 * 24 * 365,
    path: "/",
  });

  return NextResponse.redirect(`${origin}/home`);
}
