import { requireRole } from "@/lib/auth/requireRole";
import { resolveAgentDisplays } from "@/lib/admin/resolveAgentDisplay";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { GrowthDigestLogClient, type GrowthDigestLogRow } from "./GrowthDigestLogClient";
import { getServerT } from "@/lib/i18n/server";

export const metadata = {
  title: "Growth Digest Log | Admin | LeadSmart AI",
  description:
    "Weekly Growth & Opportunities digest run history. Debugging 'why didn't I get an email?' complaints.",
};

/**
 * Admin-only view into the growth_digest_log table.
 *
 * Same shape + purpose as the transaction-nudge log viewer. Scoped to
 * the last 28 days (digest is weekly, so 4 weeks of history is
 * meaningful). Not linked in the sidebar.
 */
export default async function AdminGrowthDigestsPage() {
  const t = await getServerT();
  await requireRole(["admin"]);

  const cutoff = new Date(Date.now() - 28 * 86_400_000).toISOString().slice(0, 10);

  const { data, error } = await supabaseAdmin
    .from("growth_digest_log")
    .select(
      "id, agent_id, digest_date, opportunity_count, email_sent, skipped_reason, error, created_at",
    )
    .gte("digest_date", cutoff)
    .order("created_at", { ascending: false })
    .limit(500);

  const agentIds = [
    ...new Set(
      ((data ?? []) as Array<{ agent_id: string | number }>).map((r) => String(r.agent_id)),
    ),
  ];
  const agents = await resolveAgentDisplays(agentIds);

  const rows: GrowthDigestLogRow[] = ((data ?? []) as Array<{
    id: string;
    agent_id: string | number;
    digest_date: string;
    opportunity_count: number;
    email_sent: boolean;
    skipped_reason: string | null;
    error: string | null;
    created_at: string;
  }>).map((r) => {
    const a = agents.get(String(r.agent_id));
    return {
      id: r.id,
      agentId: String(r.agent_id),
      agentEmail: a?.email ?? null,
      agentFirstName: a?.firstName ?? null,
      digestDate: r.digest_date,
      opportunityCount: r.opportunity_count,
      emailSent: r.email_sent,
      skippedReason: r.skipped_reason,
      error: r.error,
      createdAt: r.created_at,
    };
  });

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6">
      <GrowthDigestLogClient
        rows={rows}
        error={error?.message ?? null}
        cutoffIso={cutoff}
      />
    </div>
  );
}
