import { redirect } from "next/navigation";
import DashboardShell from "@/components/dashboard/DashboardShell";
import { AgentWorkspaceProviders } from "@/components/entitlements/AgentWorkspaceProviders";
import { supabaseServer } from "@/lib/supabaseServer";
import { supabaseServerClient } from "@/lib/supabaseServerClient";
import { isPaidPlanCached } from "@/lib/credits/cachedPlan";

/**
 * Account settings (profile, billing) use the same workspace chrome as `/dashboard`,
 * not the marketing Tools shell — see {@link AppShell} `isPlatformDashboardPath`.
 */
export default async function AccountLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = supabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login?redirect=/account/profile");
  }

  let appRole: string | null = null;
  try {
    const { data } = await supabaseServer
      .from("leadsmart_users")
      .select("role")
      .eq("user_id", user.id)
      .maybeSingle();
    const roleRaw = (data as { role?: string } | null)?.role;
    appRole = typeof roleRaw === "string" && roleRaw.trim() ? roleRaw.trim() : null;
  } catch {
    // ignore
  }

  // Same identity source as /dashboard — without this the sidebar derived a
  // name from the email while the top bar showed the profile name, so the
  // Profile page (of all places) showed the same person under two names.
  let fullName: string | null = null;
  let avatarUrl: string | null = null;
  try {
    const { data: profileRow } = await supabaseServer
      .from("user_profiles")
      .select("full_name,avatar_url")
      .eq("user_id", user.id)
      .maybeSingle();
    const fn = (profileRow as { full_name?: string | null } | null)?.full_name;
    fullName = typeof fn === "string" && fn.trim() ? fn.trim() : null;
    const av = (profileRow as { avatar_url?: string | null } | null)?.avatar_url;
    avatarUrl = typeof av === "string" && av.trim() ? av.trim() : null;
  } catch {
    // Non-blocking — falls back to the email-derived label.
  }

  const isPaid = await isPaidPlanCached(user.id);

  return (
    <AgentWorkspaceProviders>
      <DashboardShell email={user.email} appRole={appRole} fullName={fullName} avatarUrl={avatarUrl} isPaid={isPaid}>
        {children}
      </DashboardShell>
    </AgentWorkspaceProviders>
  );
}
