/**
 * `ai_approvals` — reads and writes, org-scoped, on whatever client the caller
 * holds (the RLS client from a request, the service client from a webhook).
 *
 * The lifecycle is in the migration (20260913000000_ai_approvals.sql). The one
 * rule enforced here is the lazy expiry: a proposal nobody decided on in
 * APPROVAL_TTL_DAYS is closed as `expired` the next time the list is read,
 * and no read ever offers one for approval.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { expiryCutoff, isExpired, type ApprovalDetails, type ApprovalRow } from "./approval-view";
import { isUuid } from "./entities";

type Db = SupabaseClient;

export const APPROVAL_COLUMNS =
  "id, organization_id, employee_slug, action_key, params, summary, details, status, source, created_at, decided_at, decided_by, executed_at, result, error";

export interface NewApproval {
  employeeSlug: string;
  actionKey: string;
  params: Record<string, unknown>;
  summary: string;
  details: ApprovalDetails;
  source?: Record<string, unknown>;
}

/** Park one proposal. Throws when the row could not be written — a proposal nobody can see is not a proposal. */
export async function insertApproval(db: Db, orgId: string, a: NewApproval): Promise<ApprovalRow> {
  const { data, error } = await db
    .from("ai_approvals")
    .insert({
      organization_id: orgId,
      employee_slug: a.employeeSlug,
      action_key: a.actionKey,
      params: a.params,
      summary: a.summary.slice(0, 500),
      details: a.details,
      source: a.source ?? {},
      status: "proposed",
    })
    .select(APPROVAL_COLUMNS)
    .single();
  if (error || !data) throw new Error(`ai_approvals insert failed: ${error?.message ?? "no row returned"}`);
  return data as ApprovalRow;
}

export async function loadApproval(db: Db, orgId: string, id: string): Promise<ApprovalRow | null> {
  if (!isUuid(id)) return null;
  const { data, error } = await db
    .from("ai_approvals")
    .select(APPROVAL_COLUMNS)
    .eq("organization_id", orgId)
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(`ai_approvals lookup failed: ${error.message}`);
  return (data as ApprovalRow | null) ?? null;
}

/**
 * Close proposals past their week. Best-effort: a failure only means they are
 * closed on the next read instead — every reader filters them out regardless.
 */
export async function expireStaleApprovals(db: Db, orgId: string, now: Date): Promise<void> {
  const { error } = await db
    .from("ai_approvals")
    .update({ status: "expired" })
    .eq("organization_id", orgId)
    .eq("status", "proposed")
    .lt("created_at", expiryCutoff(now));
  if (error) console.error("[ai-approvals] expiring stale proposals failed:", error.message);
}

/** Proposals still waiting on the owner, newest first. Never throws: a failed read is an empty list. */
export async function listProposedApprovals(db: Db, orgId: string, now: Date, limit = 20): Promise<ApprovalRow[]> {
  await expireStaleApprovals(db, orgId, now);
  const { data, error } = await db
    .from("ai_approvals")
    .select(APPROVAL_COLUMNS)
    .eq("organization_id", orgId)
    .eq("status", "proposed")
    .gte("created_at", expiryCutoff(now))
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) {
    console.error("[ai-approvals] listing proposals failed:", error.message);
    return [];
  }
  return ((data ?? []) as ApprovalRow[]).filter((r) => !isExpired(r, now));
}

/** How many proposals are waiting — the badge on Ask Mark. 0 on any failure. */
export async function countProposedApprovals(db: Db, orgId: string, now: Date): Promise<number> {
  if (!orgId) return 0;
  const { count, error } = await db
    .from("ai_approvals")
    .select("id", { count: "exact", head: true })
    .eq("organization_id", orgId)
    .eq("status", "proposed")
    .gte("created_at", expiryCutoff(now));
  if (error) {
    console.error("[ai-approvals] counting proposals failed:", error.message);
    return 0;
  }
  return count ?? 0;
}

/** Approvals that ran, for the AI activity feed. */
export async function listExecutedApprovals(db: Db, orgId: string, sinceIso: string, limit = 40): Promise<ApprovalRow[]> {
  const { data, error } = await db
    .from("ai_approvals")
    .select(APPROVAL_COLUMNS)
    .eq("organization_id", orgId)
    .eq("status", "executed")
    .gte("executed_at", sinceIso)
    .order("executed_at", { ascending: false })
    .limit(limit);
  if (error) {
    console.error("[ai-approvals] listing executed approvals failed:", error.message);
    return [];
  }
  return (data ?? []) as ApprovalRow[];
}
