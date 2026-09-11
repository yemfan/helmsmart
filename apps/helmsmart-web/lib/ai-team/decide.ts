/**
 * Deciding an approval — the only path that runs an outbound action.
 *
 * The server action (`lib/actions/approvals.ts`) checks membership and builds
 * the context; this is everything after that, with its dependencies injected
 * so the rules are tested without a database or a phone company:
 *
 *   1. the row is re-read through the caller's org — an id from another
 *      business is "not found";
 *   2. the caller's role must carry the ACTION's permission (invoices.write
 *      for a payment reminder, clients.write for a text);
 *   3. a proposal past its week is closed as expired and cannot be approved;
 *   4. `proposed → approved` is claimed with a conditional update that asks
 *      for the rows back. Two clicks, two tabs, two people: exactly one update
 *      matches, and only that caller executes. The loser is told it was
 *      already decided and gets the row as it now stands;
 *   5. the action re-validates its entities against the org and runs; the
 *      row ends `executed` or `failed`, with the real reason (an opt-out, a
 *      missing email) for the card to show;
 *   6. the specialist's run is recorded, best-effort.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { hasPermission, type Permission } from "@/lib/permissions";
import type { EmployeeRunRecord } from "@/lib/workforce-attribution";
import { EDITABLE_ACTIONS, expiryCutoff, isExpired, pickDetails, type ApprovalRow } from "./approval-view";
import { APPROVAL_COLUMNS, loadApproval } from "./approvals";
import type { ActionContext, ActionResult, AnyAction, ApprovalEdits } from "./types";

export type Decision = "approve" | "decline";

export type DecideRefusal =
  | "not_found"
  | "forbidden"
  | "already_decided"
  | "expired"
  | "invalid_edit"
  | "refused"
  | "failed"
  | "unavailable";

export type DecideCoreResult =
  | { ok: true; row: ApprovalRow }
  | { ok: false; reason: DecideRefusal; error: string; row: ApprovalRow | null };

export interface DecideDeps {
  getAction: (key: string) => AnyAction | null;
  recordRun: (db: SupabaseClient, orgId: string, slug: string, run: EmployeeRunRecord) => Promise<void>;
}

/** Deciding a row nothing in the registry can run — the owner handles it themselves. */
const MANUAL_PERMISSION: Permission = "clients.write";

async function markExpired(ctx: ActionContext, id: string): Promise<ApprovalRow | null> {
  const { data, error } = await ctx.db
    .from("ai_approvals")
    .update({ status: "expired" })
    .eq("organization_id", ctx.orgId)
    .eq("id", id)
    .eq("status", "proposed")
    .select(APPROVAL_COLUMNS);
  if (error) console.error("[ai-approvals] expiring a proposal failed:", error.message);
  return ((data ?? []) as ApprovalRow[])[0] ?? null;
}

/** Someone else got there first (or the week ran out): say which, with the row as it stands. */
async function lostTheRace(ctx: ActionContext, id: string): Promise<DecideCoreResult> {
  const t = ctx.i18n.home;
  const now = await loadApproval(ctx.db, ctx.orgId, id).catch(() => null);
  if (now && now.status === "proposed" && isExpired(now, ctx.now)) {
    const expired = (await markExpired(ctx, id)) ?? { ...now, status: "expired" };
    return { ok: false, reason: "expired", error: t("aiApprovals.errors.expired"), row: expired };
  }
  return { ok: false, reason: "already_decided", error: t("aiApprovals.errors.alreadyDecided"), row: now };
}

export async function decideApprovalCore(
  ctx: ActionContext,
  id: string,
  decision: Decision,
  edits: ApprovalEdits | undefined,
  deps: DecideDeps,
): Promise<DecideCoreResult> {
  const t = ctx.i18n.home;

  let row: ApprovalRow | null;
  try {
    row = await loadApproval(ctx.db, ctx.orgId, id);
  } catch (e) {
    console.error("[ai-approvals] loading an approval failed:", e);
    return { ok: false, reason: "unavailable", error: t("aiApprovals.errors.unavailable"), row: null };
  }
  if (!row) return { ok: false, reason: "not_found", error: t("aiApprovals.errors.notFound"), row: null };

  const action = deps.getAction(row.action_key);
  const executable = !!action && action.riskClass === "outbound";
  const permission = executable ? action!.permission : MANUAL_PERMISSION;
  if (!ctx.role || !hasPermission(ctx.role, permission)) {
    return { ok: false, reason: "forbidden", error: t("aiApprovals.errors.forbidden"), row };
  }

  if (row.status === "expired" || (row.status === "proposed" && isExpired(row, ctx.now))) {
    const expired = row.status === "expired" ? row : ((await markExpired(ctx, row.id)) ?? { ...row, status: "expired" });
    return { ok: false, reason: "expired", error: t("aiApprovals.errors.expired"), row: expired };
  }
  if (row.status !== "proposed") {
    return { ok: false, reason: "already_decided", error: t("aiApprovals.errors.alreadyDecided"), row };
  }

  const decidedAt = ctx.now.toISOString();

  // ── Decline ────────────────────────────────────────────────────────────
  if (decision === "decline") {
    const { data, error } = await ctx.db
      .from("ai_approvals")
      .update({ status: "declined", decided_at: decidedAt, decided_by: ctx.userId })
      .eq("organization_id", ctx.orgId)
      .eq("id", row.id)
      .eq("status", "proposed")
      .select(APPROVAL_COLUMNS);
    if (error) {
      console.error("[ai-approvals] decline failed:", error.message);
      return { ok: false, reason: "failed", error: t("aiApprovals.errors.failed"), row };
    }
    const declined = ((data ?? []) as ApprovalRow[])[0];
    return declined ? { ok: true, row: declined } : lostTheRace(ctx, row.id);
  }

  // ── Approve: settle the params the owner is saying yes to ──────────────
  let params: Record<string, unknown> = row.params ?? {};
  let details: Record<string, unknown> = { ...pickDetails(row.details) };
  if (executable) {
    let candidate: unknown = params;
    if (edits && EDITABLE_ACTIONS.has(row.action_key) && action!.applyEdits) {
      candidate = action!.applyEdits(params, edits);
    }
    const parsed = action!.input.safeParse(candidate);
    if (!parsed.success) {
      const message = (candidate as { message?: unknown })?.message;
      const error =
        typeof message === "string" && message.trim() === ""
          ? t("aiApprovals.errors.emptyMessage")
          : typeof message === "string"
            ? t("aiApprovals.errors.messageTooLong", { max: 1000 })
            : t("aiApprovals.errors.failed");
      return { ok: false, reason: "invalid_edit", error, row };
    }
    params = parsed.data as Record<string, unknown>;
    if (typeof params.message === "string") details = { ...details, message: params.message };
  }

  // ── Claim it. Only the caller whose update matches goes on to execute. ──
  const claim = await ctx.db
    .from("ai_approvals")
    .update({ status: "approved", decided_at: decidedAt, decided_by: ctx.userId, params, details })
    .eq("organization_id", ctx.orgId)
    .eq("id", row.id)
    .eq("status", "proposed")
    .gte("created_at", expiryCutoff(ctx.now))
    .select(APPROVAL_COLUMNS);
  if (claim.error) {
    console.error("[ai-approvals] approve claim failed:", claim.error.message);
    return { ok: false, reason: "failed", error: t("aiApprovals.errors.failed"), row };
  }
  const claimed = ((claim.data ?? []) as ApprovalRow[])[0];
  if (!claimed) return lostTheRace(ctx, row.id);

  // Nothing the team can run (an autonomy-gated employee's request): the
  // owner's "done" is the decision, and there is nothing to execute.
  if (!executable) return { ok: true, row: claimed };

  let result: ActionResult;
  try {
    result = await action!.execute(params, ctx);
  } catch (e) {
    console.error(`[ai-approvals] ${row.action_key} threw:`, e);
    result = { status: "failed", error: t("aiApprovals.errors.failed") };
  }

  const doneResult = result.status === "done" ? result : null;
  const done = doneResult !== null;
  const error = result.status === "rejected" ? result.reason : result.status === "failed" ? result.error : null;
  const patch = doneResult
    ? { status: "executed", executed_at: new Date().toISOString(), result: { summary: doneResult.summary }, error: null }
    : { status: "failed", result: { status: result.status }, error };
  const fin = await ctx.db
    .from("ai_approvals")
    .update(patch)
    .eq("organization_id", ctx.orgId)
    .eq("id", row.id)
    .eq("status", "approved")
    .select(APPROVAL_COLUMNS);
  // The send already happened (or was refused); a failed bookkeeping write
  // must not report it otherwise. Log it and answer with what happened.
  if (fin.error) console.error("[ai-approvals] recording the outcome failed:", fin.error.message);
  const finalRow = ((fin.data ?? []) as ApprovalRow[])[0] ?? ({ ...claimed, ...patch } as ApprovalRow);

  const subject = doneResult?.run?.subject ?? action!.subjectOf?.(params) ?? null;
  await deps.recordRun(ctx.db, ctx.orgId, action!.employee, {
    status: done ? "succeeded" : "failed",
    channel: action!.channel ?? "internal",
    subjectType: subject?.type ?? null,
    subjectId: subject?.id ?? null,
    outcome: {
      action: action!.key,
      approval_id: row.id,
      approved_by: ctx.userId,
      ...(doneResult ? (doneResult.run?.outcome ?? {}) : { error }),
    },
  });

  return done ? { ok: true, row: finalRow } : { ok: false, reason: "refused", error: error ?? t("aiApprovals.errors.failed"), row: finalRow };
}
