import { requireRole } from "@/lib/auth/requireRole";
import { loadAgentDisplayIdentities, type AgentDisplayIdentity } from "@/lib/agents/displayIdentity.server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { NudgeLogClient, type NudgeLogRow } from "./NudgeLogClient";
import { getServerT } from "@/lib/i18n/server";

export const metadata = {
  title: "Transaction Nudge Log | Admin | LeadSmart AI",
  description:
    "Daily transaction-coordinator digest run history across all agents. Used for support/debugging missing-email complaints.",
};

/**
 * Admin-only view into the transaction nudge-log table.
 *
 * The table is writes-heavy (one row per agent per day who has active
 * deals) and reads rare — this page is the only read. Scoped to the last
 * 14 days by default, which is how far back support complaints typically
 * reach; the table keeps forever if someone needs it.
 *
 * Not exposed in the admin sidebar — reachable via direct URL. Support
 * links to it from internal docs / Slack, not a live product surface.
 */
export default async function AdminNudgeLogPage() {
  const t = await getServerT();
  await requireRole(["admin"]);

  // 14-day window is enough for same-week support questions without
  // dragging months of rows into the client bundle.
  const cutoff = new Date(Date.now() - 14 * 86_400_000).toISOString().slice(0, 10);

  const { data, error } = await supabaseAdmin
    .from("transaction_nudge_log")
    .select("id, agent_id, digest_date, task_count, overdue_count, upcoming_count, email_sent, error, created_at")
    .gte("digest_date", cutoff)
    .order("created_at", { ascending: false })
    .limit(500);

  // Join agent display names in a second query — the log table is FK'd to
  // agents.id but the names live elsewhere. Small set, not worth a view.
  const agentIds = [
    ...new Set(
      ((data ?? []) as Array<{ agent_id: string | number }>).map((r) => String(r.agent_id)),
    ),
  ];
  const agentsById = new Map<string, { email: string | null; firstName: string | null }>();

  if (agentIds.length) {
    // Names live on user_profiles, not agents. Best-effort — a failed
    // lookup just renders empty cells.
    const identities = await loadAgentDisplayIdentities(agentIds).catch((e) => {
      console.warn("[admin.transactions-nudges] agent lookup failed:", e instanceof Error ? e.message : e);
      return new Map<string, AgentDisplayIdentity>();
    });

    // Resolve emails via auth.users, falling back to the profile email.
    for (const a of identities.values()) {
      let email: string | null = null;
      if (a.authUserId) {
        try {
          const { data: authUser } = await supabaseAdmin.auth.admin.getUserById(a.authUserId);
          email = authUser?.user?.email ?? null;
        } catch {
          email = null;
        }
      }
      agentsById.set(a.agentId, { email: email ?? a.email, firstName: a.firstName });
    }
  }

  const rows: NudgeLogRow[] = ((data ?? []) as Array<{
    id: string;
    agent_id: string | number;
    digest_date: string;
    task_count: number;
    overdue_count: number;
    upcoming_count: number;
    email_sent: boolean;
    error: string | null;
    created_at: string;
  }>).map((r) => {
    const agent = agentsById.get(String(r.agent_id));
    return {
      id: r.id,
      agentId: String(r.agent_id),
      agentEmail: agent?.email ?? null,
      agentFirstName: agent?.firstName ?? null,
      digestDate: r.digest_date,
      taskCount: r.task_count,
      overdueCount: r.overdue_count,
      upcomingCount: r.upcoming_count,
      emailSent: r.email_sent,
      error: r.error,
      createdAt: r.created_at,
    };
  });

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6">
      <NudgeLogClient rows={rows} error={error?.message ?? null} cutoffIso={cutoff} />
    </div>
  );
}
