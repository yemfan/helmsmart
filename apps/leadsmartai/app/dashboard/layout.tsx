import { redirect } from "next/navigation";
import { ERROR_DASHBOARD_NO_AGENT_ROW } from "@leadsmart/shared";
import { reconcileEntitlement } from "@/lib/entitlements/ensureStarterEntitlement";
import { getCurrentAgentContext } from "@/lib/dashboardService";
import { isRedirectError } from "@/lib/isRedirectError";
import DashboardShell from "@/components/dashboard/DashboardShell";
import { AgentWorkspaceProviders } from "@/components/entitlements/AgentWorkspaceProviders";
import { ADMIN_SUPPORT_HOME_PATH, isAdminOrSupportRole } from "@/lib/rolePortalPaths";
import { supabaseServer } from "@/lib/supabaseServer";
import { supabaseServerClient } from "@/lib/supabaseServerClient";
import { AiChatPanel } from "@/components/dashboard/AiChatPanel";
import { ToastProvider } from "@/components/ui/Toast";
import { ErrorBoundary } from "@/components/ui/ErrorBoundary";
import { CommandPalette } from "@/components/ui/CommandPalette";
import { getServerT } from "@/lib/i18n/server";
import { isPaidPlanCached } from "@/lib/credits/cachedPlan";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const t = await getServerT();
  const ctx = await (async () => {
    try {
      return await getCurrentAgentContext();
    } catch (e: unknown) {
      if (isRedirectError(e)) throw e;
      const msg = e instanceof Error ? e.message : "";
      if (msg === "Not authenticated") {
        redirect("/login?redirect=/dashboard");
      }
      if (msg === ERROR_DASHBOARD_NO_AGENT_ROW) {
        const supabase = supabaseServerClient();
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (user?.id) {
          const { data: ls } = await supabaseServer
            .from("leadsmart_users")
            .select("role")
            .eq("user_id", user.id)
            .maybeSingle();
          const roleRaw = (ls as { role?: string } | null)?.role;
          if (isAdminOrSupportRole(roleRaw)) {
            redirect(ADMIN_SUPPORT_HOME_PATH);
          }
        }
        redirect("/agent-signup?redirect=/dashboard");
      }
      throw e;
    }
  })();

  let appRole: string | null = null;

  // Feature gating: dashboard requires active/trialing subscription.
  try {
    const { data } = await supabaseServer
      .from("leadsmart_users")
      .select("subscription_status,trial_ends_at,role")
      .eq("user_id", ctx.userId)
      .maybeSingle();
    const roleRaw = (data as { role?: string } | null)?.role;
    appRole = typeof roleRaw === "string" && roleRaw.trim() ? roleRaw.trim() : null;
    const staff = isAdminOrSupportRole(appRole);
    let status = String((data as any)?.subscription_status ?? "").toLowerCase();
    const trialEndsAt = (data as any)?.trial_ends_at
      ? new Date(String((data as any).trial_ends_at))
      : null;
    if (status === "trialing" && trialEndsAt && trialEndsAt.getTime() <= Date.now()) {
      status = "inactive";
      await supabaseServer
        .from("leadsmart_users")
        .update({ plan: "free", subscription_status: "inactive" } as Record<string, unknown>)
        .eq("user_id", ctx.userId);
    }
    // Ensure the user has an entitlement that MATCHES their plan. Idempotent
    // and read-only on the happy path; only writes when a row is missing or
    // the user row is stale. This closes the gap where an ACTIVE paid user
    // (e.g. an admin/comp "premium") has no synced product_entitlements row
    // and would otherwise be treated as free by every gated feature
    // (quotas, lead/contact caps, AI actions, alerts, team).
    if (!staff) {
      try {
        await reconcileEntitlement(ctx.userId);
      } catch (err) {
        console.warn(
          "[dashboard layout] reconcileEntitlement failed:",
          err instanceof Error ? err.message : err,
        );
      }
    }

    if (!staff && status && !["active", "trialing"].includes(status)) {
      // Inactive-sub flow: reconcile (above) already dropped them onto the
      // Starter (free) entitlement; send them to confirm their profile.
      // complete-profile no-ops for users who already have a role, so it's
      // safe as a universal landing.
      redirect("/auth/complete-profile?next=/dashboard");
    }
  } catch (e) {
    if (isRedirectError(e)) throw e;
    // If profiles/status isn't available yet, don't block dashboard rendering.
  }

  // Single source of truth for the user's display identity: the sidebar
  // footer, the top-bar profile menu, and the greeting all read from here.
  // Without this, the sidebar derived a name from the email local-part while
  // the top bar showed user_profiles.full_name — so the same user appeared
  // under two different names at once.
  let fullName: string | null = null;
  let avatarUrl: string | null = null;
  try {
    const { data: profileRow } = await supabaseServer
      .from("user_profiles")
      .select("full_name,avatar_url")
      .eq("user_id", ctx.userId)
      .maybeSingle();
    const fn = (profileRow as { full_name?: string | null } | null)?.full_name;
    fullName = typeof fn === "string" && fn.trim() ? fn.trim() : null;
    const av = (profileRow as { avatar_url?: string | null } | null)?.avatar_url;
    avatarUrl = typeof av === "string" && av.trim() ? av.trim() : null;
  } catch {
    // Non-blocking — fall back to email-derived label below.
  }

  // Upsell chrome (Upgrade pill, sidebar promo) is keyed on the plan, not the
  // role: a Signature subscriber was being asked to upgrade on every page.
  const isPaid = await isPaidPlanCached(ctx.userId);

  return (
    <AgentWorkspaceProviders>
      <ToastProvider>
        <DashboardShell
          email={ctx?.email}
          appRole={appRole}
          fullName={fullName}
          avatarUrl={avatarUrl}
          isPaid={isPaid}
        >
          <ErrorBoundary>
            {children}
          </ErrorBoundary>
          <AiChatPanel />
          <CommandPalette />
        </DashboardShell>
      </ToastProvider>
    </AgentWorkspaceProviders>
  );
}

