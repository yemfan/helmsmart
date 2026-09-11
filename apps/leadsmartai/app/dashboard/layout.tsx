import { redirect } from "next/navigation";
import { ERROR_DASHBOARD_NO_AGENT_ROW } from "@leadsmart/shared";
import { readReconcileInputs, reconcileEntitlement } from "@/lib/entitlements/ensureStarterEntitlement";
import { getCurrentAgentContext } from "@/lib/dashboardService";
import { isRedirectError } from "@/lib/isRedirectError";
import DashboardShell from "@/components/dashboard/DashboardShell";
import { AgentWorkspaceProviders } from "@/components/entitlements/AgentWorkspaceProviders";
import { ADMIN_SUPPORT_HOME_PATH, isAdminOrSupportRole } from "@/lib/rolePortalPaths";
import { supabaseServer } from "@/lib/supabaseServer";
import { supabaseServerClient } from "@/lib/supabaseServerClient";
import { ToastProvider } from "@/components/ui/Toast";
import { ConfirmProvider } from "@/components/ui/useConfirm";
import { UnsavedChangesProvider } from "@/lib/forms/unsaved";
import { ErrorBoundary } from "@/components/ui/ErrorBoundary";
import { CommandPalette } from "@/components/ui/CommandPalette";
import { KeyboardShortcuts } from "@/components/ui/KeyboardShortcuts";
import { getServerT } from "@/lib/i18n/server";
import { teamNavVisibleFor } from "@/lib/teams/visibility.server";

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

  // Everything below needs only the user id, so it is one round-trip: the
  // profile, the account row, and the entitlement the reconcile judges. In
  // series — account row, then the reconcile's two reads, then the profile,
  // then a Stripe lookup for the Upgrade pill — the document's first byte
  // waited ~0.9 s on production even warm, while the API routes answer in
  // 0.2 s (2026-09-08).
  const [profileRow, accountRow, reconcileInputs] = await Promise.all([
    supabaseServer
      .from("user_profiles")
      .select("full_name,avatar_url")
      .eq("user_id", ctx.userId)
      .maybeSingle()
      .then((r) => r.data, () => null),
    supabaseServer
      .from("leadsmart_users")
      .select("subscription_status,trial_ends_at,role")
      .eq("user_id", ctx.userId)
      .maybeSingle()
      .then((r) => r.data, () => null),
    readReconcileInputs(ctx.userId).catch(() => null),
  ]);
  let activeEntitlement = reconcileInputs?.activeRow ?? null;

  // Feature gating: dashboard requires active/trialing subscription.
  try {
    const data = accountRow;
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
    if (!staff && reconcileInputs) {
      try {
        // The account row as it is now — the trial-expiry write above is not
        // in the batched read.
        const rec = await reconcileEntitlement(ctx.userId, {
          activeRow: reconcileInputs.activeRow,
          row: reconcileInputs.row ? { ...reconcileInputs.row, subscription_status: status } : null,
        });
        // Reconcile can have just synced the user row back to "active" (a
        // past_due left by a webhook race, a comp plan with no entitlement
        // row). The redirect below must judge the row as it is NOW: judged
        // on the read from before reconcile ran, an active subscriber was
        // bounced to the OAuth profile gate for one request and let in on
        // the next — seen live on 2026-09-07. Only worth a read when it wrote.
        if (rec.changed) {
          const [{ data: fresh }, freshInputs] = await Promise.all([
            supabaseServer
              .from("leadsmart_users")
              .select("subscription_status")
              .eq("user_id", ctx.userId)
              .maybeSingle(),
            readReconcileInputs(ctx.userId).catch(() => null),
          ]);
          const now = String((fresh as { subscription_status?: string | null } | null)?.subscription_status ?? "").toLowerCase();
          if (now) status = now;
          if (freshInputs) activeEntitlement = freshInputs.activeRow;
        }
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
  const fn = (profileRow as { full_name?: string | null } | null)?.full_name;
  const fullName = typeof fn === "string" && fn.trim() ? fn.trim() : null;
  const av = (profileRow as { avatar_url?: string | null } | null)?.avatar_url;
  const avatarUrl = typeof av === "string" && av.trim() ? av.trim() : null;

  // Upsell chrome (Upgrade pill, sidebar promo) is keyed on the plan, not the
  // role: a Signature subscriber was being asked to upgrade on every page. The
  // plan is the entitlement every gate in the app reads — anything above
  // Starter is a live subscription — not a Stripe lookup on the page's
  // critical path.
  const isPaid = Boolean(activeEntitlement?.plan && activeEntitlement.plan !== "starter");

  // The Team row: Signature owners, and anyone already on a team.
  const showTeam = await teamNavVisibleFor({ userId: ctx.userId, agentId: String(ctx.agentId), plan: activeEntitlement?.plan ?? null });

  return (
    <AgentWorkspaceProviders>
      <ToastProvider>
       <ConfirmProvider>
       <UnsavedChangesProvider>
        <DashboardShell
          email={ctx?.email}
          appRole={appRole}
          fullName={fullName}
          avatarUrl={avatarUrl}
          isPaid={isPaid}
          showTeam={showTeam}
        >
          <ErrorBoundary>
            {children}
          </ErrorBoundary>
          <CommandPalette showTeam={showTeam} />
          <KeyboardShortcuts />
        </DashboardShell>
       </UnsavedChangesProvider>
       </ConfirmProvider>
      </ToastProvider>
    </AgentWorkspaceProviders>
  );
}

