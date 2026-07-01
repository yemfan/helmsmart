import { supabaseAdmin } from "@/lib/supabase/admin";
import { listTransactionsForAgent } from "@/lib/transactions/service";
import { listTasksForAgent } from "@/lib/crm/pipeline/tasks";
import { pausedAssistantTypes } from "@/lib/realtorboss/assistants";

export type BossRecommendationRow = {
  id: string;
  agent_id: string;
  recommendation_type: string;
  title: string;
  summary: string | null;
  reason: string | null;
  priority: number;
  related_entity_type: string | null;
  related_entity_id: string | null;
  recommended_action: string | null;
  action_href: string | null;
  /** Constitution: what acting on this should achieve. */
  expected_outcome: string | null;
  dedupe_key: string;
  status: "new" | "accepted" | "dismissed" | "completed";
  created_at: string;
  updated_at: string;
};

type Candidate = Omit<
  BossRecommendationRow,
  "id" | "agent_id" | "status" | "created_at" | "updated_at"
>;

const DAY_MS = 24 * 60 * 60 * 1000;

/** After a receivable is chased (re)sent, wait this long before nudging again. */
const CHASE_COOLDOWN_MS = 4 * DAY_MS;

function dayStamp(): string {
  return new Date().toISOString().slice(0, 10);
}

function fmtDay(d: Date): string {
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

/**
 * Build the current recommendation set from real CRM signals.
 * Deterministic (no LLM): the Boss Assistant mandate is deadlines →
 * hot opportunities → AI activity needing a human → task hygiene,
 * encoded as ascending `priority` ranks. Paused assistants contribute
 * nothing (pausing hides that assistant's recommendations).
 */
async function buildCandidates(agentId: string): Promise<Candidate[]> {
  const paused = await pausedAssistantTypes(agentId);
  const out: Candidate[] = [];
  const now = Date.now();

  // ── Transaction deadlines (transaction assistant) ────────────────
  if (!paused.has("transaction_assistant")) {
    const transactions = await listTransactionsForAgent(agentId).catch(() => []);
    for (const t of transactions) {
      if (t.status !== "active" && t.status !== "pending") continue;
      const checks: { slug: string; label: string; date: string | null; done: string | null }[] = [
        { slug: "inspection", label: "Inspection contingency", date: t.inspection_deadline, done: t.inspection_completed_at },
        { slug: "appraisal", label: "Appraisal deadline", date: t.appraisal_deadline, done: t.appraisal_completed_at },
        { slug: "loan", label: "Loan contingency", date: t.loan_contingency_deadline, done: t.loan_contingency_removed_at },
        { slug: "closing", label: "Closing", date: t.closing_date, done: null },
      ];
      // Is any milestone on THIS deal already overdue? A single source of truth
      // for the deal's health so the closing card can't say "on track" while an
      // earlier contingency has blown past (that contradiction showed the same
      // deal as "on track" on the Boss feed and "overdue" on the Tx Assistant).
      const dealHasOverdue = checks.some(
        (c) => c.date && !c.done && new Date(c.date).getTime() < now,
      );
      for (const c of checks) {
        if (!c.date || c.done) continue;
        const due = new Date(c.date);
        if (due.getTime() > now + 7 * DAY_MS) continue;
        const overdue = due.getTime() < now;
        // The closing is only genuinely "on track" if nothing else on the deal
        // is overdue.
        const closingBlocked = c.slug === "closing" && dealHasOverdue;
        out.push({
          recommendation_type: "transaction_deadline",
          title: `${c.label} — ${t.property_address}`,
          summary: `${overdue ? "Passed" : "Due"} ${fmtDay(due)}${t.contact_name ? ` · ${t.contact_name}` : ""}`,
          reason: overdue
            ? "This deadline has passed and the item is still open."
            : closingBlocked
              ? "Closing is near, but an earlier contingency on this deal is overdue — clear it first."
              : "Missing a contingency deadline can put the deal at risk.",
          priority: overdue ? 10 : closingBlocked ? 12 : 20,
          related_entity_type: "transaction",
          related_entity_id: t.id,
          recommended_action: "Review transaction",
          action_href: `/dashboard/transactions/${t.id}`,
          expected_outcome: overdue
            ? "Contingency handled before it can derail the closing."
            : closingBlocked
              ? "The overdue item is cleared so the closing isn't at risk."
              : "Deal stays on track to close on schedule.",
          dedupe_key: `tx_deadline:${t.id}:${c.slug}`,
        });
      }
    }
  }

  // ── AI Accountant: the paycheck is commission at closing ─────────
  if (!paused.has("accountant")) {
    // Deals closing soon with no commission details = an unknown paycheck.
    const txs = await listTransactionsForAgent(agentId).catch(() => []);
    for (const t of txs) {
      if (t.status !== "active" && t.status !== "pending") continue;
      if (t.gross_commission != null || t.agent_net_commission != null) continue;
      if (!t.closing_date) continue;
      const close = new Date(t.closing_date);
      if (close.getTime() > now + 14 * DAY_MS || close.getTime() < now - DAY_MS) continue;
      out.push({
        recommendation_type: "commission_missing",
        title: `Confirm commission details — ${t.property_address}`,
        summary: `Closes ${fmtDay(close)} with no commission recorded`,
        reason: "This closing's payout is unknown until the commission, split, and referral fee are entered.",
        priority: 18,
        related_entity_type: "transaction",
        related_entity_id: t.id,
        recommended_action: "Open transaction",
        action_href: `/dashboard/transactions/${t.id}`,
        expected_outcome: "Pipeline and payout numbers you can trust.",
        dedupe_key: `commission_missing:${t.id}`,
      });
    }
  }

  // ── Overdue receivables (referral fees, rebills) ─────────────────
  if (!paused.has("accountant")) {
    const { data: overdueInv } = await supabaseAdmin
      .from("invoices")
      .select("id,invoice_number,client_name,total,due_date,last_sent_at")
      .eq("agent_id", agentId)
      .or(`status.eq.overdue,and(status.eq.sent,due_date.lt.${new Date().toISOString().slice(0, 10)})`)
      .order("due_date", { ascending: true })
      .limit(10);
    const chaseable = ((overdueInv ?? []) as {
      id: string;
      invoice_number: string;
      client_name: string | null;
      total: number | null;
      due_date: string | null;
      last_sent_at: string | null;
    }[])
      // A reminder just went out — give the client the cooldown to pay before we
      // nudge again. Suppressing the candidate lets syncBossRecommendations
      // auto-close the open card; once the cooldown lapses (and it's still
      // unpaid & overdue) it re-enters below under a fresh, rotated key.
      .filter(
        (inv) =>
          !inv.last_sent_at || now - new Date(inv.last_sent_at).getTime() >= CHASE_COOLDOWN_MS,
      )
      .slice(0, 3);
    for (const inv of chaseable) {
      const days = inv.due_date
        ? Math.max(1, Math.floor((now - new Date(inv.due_date).getTime()) / DAY_MS))
        : null;
      // Rotate the dedupe key by the last-reminder day so each nudge cycle is a
      // distinct card (the sync upsert ignores duplicate keys, so a stable key
      // would never re-surface after auto-close). Base key until first reminded.
      const remindedDay = inv.last_sent_at ? inv.last_sent_at.slice(0, 10) : null;
      out.push({
        recommendation_type: "invoice_overdue",
        title: `Chase receivable ${inv.invoice_number}${inv.client_name ? ` — ${inv.client_name}` : ""}`,
        summary: `${inv.total != null ? `$${Math.round(inv.total).toLocaleString()}` : "Unpaid"}${days ? ` · ${days} day${days === 1 ? "" : "s"} past due` : ""}`,
        reason: "Money owed to you outside of closings ages fast — a polite nudge now usually settles it.",
        priority: 22,
        related_entity_type: "invoice",
        related_entity_id: inv.id,
        recommended_action: "Open invoices",
        action_href: "/dashboard/books",
        expected_outcome: "Invoice paid without souring the relationship.",
        dedupe_key: remindedDay
          ? `invoice_overdue:${inv.id}:${remindedDay}`
          : `invoice_overdue:${inv.id}`,
      });
    }
  }

  // ── Hot leads (sales assistant) ──────────────────────────────────
  if (!paused.has("sales_assistant")) {
    const { data: hot } = await supabaseAdmin
      .from("contacts")
      .select("id,name,engagement_score,last_activity_at")
      .eq("agent_id", agentId)
      .eq("rating", "hot")
      .order("engagement_score", { ascending: false, nullsFirst: false })
      .limit(3);
    for (const l of (hot ?? []) as { id: string; name: string | null; engagement_score: number | null }[]) {
      out.push({
        recommendation_type: "hot_lead",
        title: `Call ${l.name?.trim() || "your hot lead"}`,
        summary: l.engagement_score != null ? `Engagement score ${l.engagement_score}` : null,
        reason: "Rated hot — fast follow-up is what wins listings and offers.",
        priority: 30,
        related_entity_type: "contact",
        related_entity_id: String(l.id),
        recommended_action: "Open lead",
        action_href: `/dashboard/contacts?list=leads&highlight=${encodeURIComponent(String(l.id))}`,
        expected_outcome: "High-likelihood appointment or offer this week.",
        dedupe_key: `hot_lead:${l.id}`,
      });
    }
  }

  // ── Missed calls without a text-back (receptionist) ──────────────
  if (!paused.has("receptionist")) {
    const { data: missed } = await supabaseAdmin
      .from("call_logs")
      .select("id,textback_message_log_id,status,direction,created_at")
      .eq("agent_id", agentId)
      .eq("direction", "inbound")
      .neq("status", "completed")
      .is("textback_message_log_id", null)
      .gte("created_at", new Date(now - 2 * DAY_MS).toISOString())
      .limit(50);
    const count = (missed ?? []).length;
    if (count > 0) {
      out.push({
        recommendation_type: "missed_calls",
        title: `${count} missed call${count > 1 ? "s" : ""} need a human follow-up`,
        summary: "Last 48 hours",
        reason: "The AI Receptionist could not reach these callers with a text-back.",
        priority: 25,
        related_entity_type: null,
        related_entity_id: null,
        recommended_action: "Review calls",
        action_href: "/dashboard/ai-receptionist",
        expected_outcome: "Caller recovered before they reach another agent.",
        dedupe_key: `missed_calls:${dayStamp()}`,
      });
    }
  }

  // ── Overdue CRM tasks (boss-level hygiene) ───────────────────────
  const tasks = await listTasksForAgent({ agentId, status: "open_only", limit: 100 }).catch(() => []);
  const overdue = tasks.filter(
    (t) => (t as { due_at?: string | null }).due_at && new Date(String((t as { due_at?: string | null }).due_at)).getTime() < now,
  );
  if (overdue.length > 0) {
    const oldest = overdue[0] as { title?: string };
    out.push({
      recommendation_type: "overdue_tasks",
      title: `Clear ${overdue.length} overdue task${overdue.length > 1 ? "s" : ""}`,
      summary: oldest?.title ? `Oldest: "${oldest.title}"` : null,
      reason: "Overdue tasks usually hide a stalled follow-up.",
      priority: 40,
      related_entity_type: null,
      related_entity_id: null,
      recommended_action: "Open tasks",
      action_href: "/dashboard/tasks",
      expected_outcome: "Stalled follow-ups start moving again.",
      dedupe_key: `overdue_tasks:${dayStamp()}`,
    });
  }

  return out;
}

/**
 * Sync the agent's recommendations with current CRM signals:
 *   • new facts insert as status 'new'
 *   • existing rows keep their status (dismissed stays dismissed)
 *   • open rows whose underlying fact disappeared auto-complete
 */
export async function syncBossRecommendations(agentId: string): Promise<void> {
  const candidates = await buildCandidates(agentId);

  if (candidates.length > 0) {
    const { error } = await supabaseAdmin.from("boss_recommendations").upsert(
      candidates.map((c) => ({ ...c, agent_id: agentId })) as Record<string, unknown>[],
      { onConflict: "agent_id,dedupe_key", ignoreDuplicates: true },
    );
    if (error) console.warn("[realtorboss] recommendation upsert failed:", error.message);
  }

  // Auto-complete open recommendations whose fact no longer holds.
  const keys = new Set(candidates.map((c) => c.dedupe_key));
  const { data: open, error: openErr } = await supabaseAdmin
    .from("boss_recommendations")
    .select("id,dedupe_key")
    .eq("agent_id", agentId)
    .in("status", ["new", "accepted"]);
  if (openErr) {
    console.warn("[realtorboss] recommendation stale-check failed:", openErr.message);
    return;
  }
  const staleIds = ((open ?? []) as { id: string; dedupe_key: string }[])
    .filter((r) => !keys.has(r.dedupe_key))
    .map((r) => r.id);
  if (staleIds.length > 0) {
    await supabaseAdmin
      .from("boss_recommendations")
      .update({ status: "completed", updated_at: new Date().toISOString() })
      .in("id", staleIds);
  }
}

export async function listBossRecommendations(
  agentId: string,
  limit = 5,
): Promise<BossRecommendationRow[]> {
  const { data, error } = await supabaseAdmin
    .from("boss_recommendations")
    .select("*")
    .eq("agent_id", agentId)
    .in("status", ["new", "accepted"])
    .order("priority", { ascending: true })
    .order("created_at", { ascending: false })
    .limit(Math.min(Math.max(limit, 1), 20));
  if (error) throw new Error(error.message);
  return (data ?? []) as BossRecommendationRow[];
}

export async function setBossRecommendationStatus(
  agentId: string,
  id: string,
  status: "accepted" | "dismissed" | "completed",
): Promise<boolean> {
  const { data, error } = await supabaseAdmin
    .from("boss_recommendations")
    .update({ status, updated_at: new Date().toISOString() })
    .eq("agent_id", agentId)
    .eq("id", id)
    .select("id")
    .maybeSingle();
  if (error) throw new Error(error.message);
  return Boolean(data);
}
