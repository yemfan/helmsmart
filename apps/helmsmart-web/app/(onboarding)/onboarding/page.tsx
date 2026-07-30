import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { OnboardingForm } from "@/components/onboarding-form";
import { getActivePack } from "@/lib/packs";

/**
 * Onboarding page — server component that gate-checks auth, then renders the
 * client OnboardingForm.
 *
 * IMPORTANT: membership is resolved from the DB, NOT from the helmsmart-org-id
 * cookie. A stale/invalid cookie (e.g. left behind by a previous account on this
 * browser) must never skip onboarding — otherwise a fresh signup with a leftover
 * cookie lands in an empty org it doesn't belong to and can never create its own.
 * The cookie is an optimization set by createOrg / restore-org, not a source of
 * truth here.
 */
export default async function OnboardingPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  // Source of truth: does this user actually belong to an org?
  const { data: existing } = await supabase
    .from("organization_members")
    .select("organization_id")
    .eq("user_id", user.id)
    .limit(1)
    .maybeSingle();

  if (existing) {
    // Real membership — (re)establish the cookie via the API route (a server
    // component can't set cookies) and head to the dashboard.
    redirect(`/api/auth/restore-org?org_id=${existing.organization_id}`);
  }

  // No org yet — show the create form regardless of any leftover cookie.
  const pack = await getActivePack();
  return <OnboardingForm namePlaceholder={pack.businessNameExample} />;
}
