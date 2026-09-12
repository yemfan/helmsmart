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
 *      for a payment reminder, clients.write for a text) — to approve AND to
 *      decline;
 *   3. a proposal past its week is closed as expired and cannot be approved;
 *   4. approving re-runs the action's preview against the data as it is NOW
 *      and sends only what the owner was shown: the card's fingerprint of the
 *      details it displayed, the fingerprint of the row's stored details and
 *      the fingerprint of the fresh preview must all agree (recipient,
 *      phone/email, amount, message). Any org member can update a proposed
 *      row, and clients and invoices change — so a card that said "Priya"
 *      must never text someone else. A mismatch leaves the row proposed;
 *   5. `proposed → approved` is claimed with a conditional update that asks
 *      for the rows back. Two clicks, two tabs, two people: exactly one update
 *      matches, and only that caller executes. The loser is told it was
 *      already decided and gets the row as it now stands;
 *   6. the action re-validates its entities against the org and runs; the
 *      row ends `executed` or `failed`, with the real reason (an opt-out, a
 *      missing email) for the card to show;
 *   7. the specialist's run is recorded, best-effort.
 *
 * A claim whose outcome never landed (the server died mid-send) is
 * `unconfirmed` (see `isUnconfirmed`): it is never retried — it may have
 * reached the customer — and `dismissUnconfirmedCore` is the only way out.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { hasPermission, type Permission } from "@/lib/permissions";
import type { EmployeeRunRecord } from "@/lib/workforce-attribution";
import {
  APPROVABLE_ACTIONS,
  EDITABLE_ACTIONS,
  UNCONFIRMED_RESULT,
  expiryCutoff,
  isExpired,
  isUnconfirmed,
  pickDetails,
  type ApprovalRow,
} from "./approval-view";
import { approvalFingerprint } from "./fingerprint.server";
import { APPROVAL_COLUMNS, loadApproval } from "./approvals";
import type { ActionContext, ActionResult, AnyAction, ApprovalEdits, PreviewResult } from "./types";

export type Decision = "approve" | "decline";

export type DecideRefusal =
  | "not_found"
  | "forbidden"
  | "already_decided"
  | "expired"
  | "invalid_edit"
  | "changed"
  | "refused"
  | "failed"
  | "unavailable"
  | "in_flight"
  | "nothing_to_dismiss";

export type DecideCoreResult =
  | { ok: true; row: ApprovalRow }
  | { ok: false; reason: DecideRefusal; error: string; row: ApprovalRow | null };

export interface DecideDeps {
  getAction: (key: string) => AnyAction | null;
  recordRun: (db: SupabaseClient, orgId: string, slug: string, run: EmployeeRunRecord) => Promise<void>;
}

/** What the approver sent with their decision. */
export interface DecideInput {
  /** What the owner changed before approving (the text of a message). */
  edits?: ApprovalEdits;
  /**
   * `approvalFingerprint` of the details the card showed, with the message
   * the owner confirmed. Required to approve anything the team would send.
   */
  fingerprint?: string | null;
}

/** Deciding a row nothing in the registry can run — the owner handles it themselves. */
const MANUAL_PERMISSION: Permission = "clients.write";

function isRunnable(action: AnyAction | null): action is AnyAction {
  return !!action && action.riskClass === "outbound";
}

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

/**
 * The action can't be done any more (the invoice was paid, the client opted
 * out or left the business): close the proposal with the reason. Nothing was
 * sent — the preview refused before anything was claimed.
 */
async function closeRefused(ctx: ActionContext, row: ApprovalRow, reason: string): Promise<DecideCoreResult> {
  const { data, error } = await ctx.db
    .from("ai_approvals")
    .update({
      status: "failed",
      decided_at: ctx.now.toISOString(),
      decided_by: ctx.userId,
      result: { status: "rejected" },
      error: reason,
    })
    .eq("organization_id", ctx.orgId)
    .eq("id", row.id)
    .eq("status", "proposed")
    .select(APPROVAL_COLUMNS);
  if (error) {
    console.error("[ai-approvals] closing a refused proposal failed:", error.message);
    return { ok: false, reason: "refused", error: reason, row };
  }
  const closed = ((data ?? []) as ApprovalRow[])[0];
  return closed ? { ok: false, reason: "refused", error: reason, row: closed } : lostTheRace(ctx, row.id);
}

export async function decideApprovalCore(
  ctx: ActionContext,
  id: string,
  decision: Decision,
  input: DecideInput | undefined,
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

  // The same permission to approve and to decline: saying no for the owner is
  // a decision about a customer too.
  const action = deps.getAction(row.action_key);
  const executable = isRunnable(action);
  const permission = executable ? action.permission : MANUAL_PERMISSION;
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
    const edits = input?.edits;
    if (edits && EDITABLE_ACTIONS.has(row.action_key) && action.applyEdits) {
      candidate = action.applyEdits(params, edits);
    }
    const parsed = action.input.safeParse(candidate);
    if (!parsed.success) {
      // The edited text, whatever the action calls it — a text's `message`, a
      // social post's `content`. Both reach here through the same edit field.
      const edited = candidate as { message?: unknown; content?: unknown } | null;
      const message = typeof edited?.message === "string" ? edited.message : edited?.content;
      const error =
        typeof message === "string" && message.trim() === ""
          ? t("aiApprovals.errors.emptyMessage")
          : typeof message === "string"
            ? t("aiApprovals.errors.messageTooLong", { max: 1000 })
            : t("aiApprovals.errors.failed");
      return { ok: false, reason: "invalid_edit", error, row };
    }
    params = parsed.data as Record<string, unknown>;

    // ── Approve exactly what was shown ───────────────────────────────────
    if (!action.preview) {
      console.error(`[ai-approvals] ${row.action_key} is outbound but has no preview`);
      return { ok: false, reason: "failed", error: t("aiApprovals.errors.failed"), row };
    }
    let preview: PreviewResult;
    try {
      preview = await action.preview(params, ctx);
    } catch (e) {
      console.error(`[ai-approvals] re-checking ${row.action_key} failed:`, e);
      return { ok: false, reason: "unavailable", error: t("aiApprovals.errors.failed"), row };
    }
    if (!preview.ok) return closeRefused(ctx, row, preview.ownerReason ?? t("aiApprovals.errors.failed"));

    const fresh = pickDetails(preview.details);
    const freshFp = approvalFingerprint(row.action_key, fresh);
    // The stored details, with the message the owner is approving (an edit
    // is theirs to make; everything else must be as proposed).
    const storedFp = approvalFingerprint(row.action_key, { ...pickDetails(row.details), message: fresh.message });
    const shownFp = input?.fingerprint ?? null;
    if (shownFp !== freshFp || storedFp !== freshFp) {
      const why = !shownFp
        ? "no fingerprint from the card"
        : shownFp !== freshFp
          ? "not what the card showed"
          : "the row's details no longer match its params";
      console.warn(`[ai-approvals] refused to approve ${row.id} (${row.action_key}): ${why}`);
      return { ok: false, reason: "changed", error: t("aiApprovals.errors.changed"), row };
    }
    details = { ...fresh };
  }

  // ── Claim it. Only the caller whose update matches goes on to execute. ──
  // `params` is written with the claim and is what runs — never re-read — so
  // a change to the row after this check cannot change what is sent.
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
    result = await action.execute(params, ctx);
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
  else if (!fin.data || (fin.data as unknown[]).length === 0) {
    // Only an owner's dismissal of an "unconfirmed" row moves it off
    // `approved` — so this send outlived that threshold. Say so loudly.
    console.error(`[ai-approvals] ${row.id} finished (${patch.status}) after it stopped being approved — outcome not recorded`);
  }
  const finalRow = ((fin.data ?? []) as ApprovalRow[])[0] ?? ({ ...claimed, ...patch } as ApprovalRow);

  const subject = doneResult?.run?.subject ?? action.subjectOf?.(params) ?? null;
  await deps.recordRun(ctx.db, ctx.orgId, action.employee, {
    status: done ? "succeeded" : "failed",
    channel: action.channel ?? "internal",
    subjectType: subject?.type ?? null,
    subjectId: subject?.id ?? null,
    outcome: {
      action: action.key,
      approval_id: row.id,
      approved_by: ctx.userId,
      ...(doneResult ? (doneResult.run?.outcome ?? {}) : { error }),
    },
  });

  return done ? { ok: true, row: finalRow } : { ok: false, reason: "refused", error: error ?? t("aiApprovals.errors.failed"), row: finalRow };
}

/**
 * Close an approval that never reported back (`isUnconfirmed`). It becomes
 * `failed` with a reason that says we couldn't confirm it — never a retry:
 * the text or email may already have reached the customer.
 *
 * The same permission as approving the action. A row still inside the
 * in-flight window can't be dismissed (the send may be finishing right now);
 * one that already finished has nothing to dismiss.
 */
export async function dismissUnconfirmedCore(
  ctx: ActionContext,
  id: string,
  deps: Pick<DecideDeps, "getAction">,
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
  const permission = isRunnable(action) ? action.permission : MANUAL_PERMISSION;
  if (!ctx.role || !hasPermission(ctx.role, permission)) {
    return { ok: false, reason: "forbidden", error: t("aiApprovals.errors.forbidden"), row };
  }

  if (!isUnconfirmed(row, ctx.now)) {
    const inFlight = row.status === "approved" && APPROVABLE_ACTIONS.has(row.action_key) && !row.executed_at && !row.error;
    return inFlight
      ? { ok: false, reason: "in_flight", error: t("aiApprovals.errors.stillSending"), row }
      : { ok: false, reason: "nothing_to_dismiss", error: t("aiApprovals.errors.nothingToDismiss"), row };
  }

  const { data, error } = await ctx.db
    .from("ai_approvals")
    .update({
      status: "failed",
      error: t("aiApprovals.errors.dismissedUnconfirmed"),
      result: { status: UNCONFIRMED_RESULT, dismissed_by: ctx.userId, dismissed_at: ctx.now.toISOString() },
    })
    .eq("organization_id", ctx.orgId)
    .eq("id", row.id)
    .eq("status", "approved")
    .is("executed_at", null)
    .is("error", null)
    .select(APPROVAL_COLUMNS);
  if (error) {
    console.error("[ai-approvals] dismissing an unconfirmed approval failed:", error.message);
    return { ok: false, reason: "failed", error: t("aiApprovals.errors.failed"), row };
  }
  const dismissed = ((data ?? []) as ApprovalRow[])[0];
  if (dismissed) return { ok: true, row: dismissed };
  // It finished (or someone else dismissed it) between the read and the write.
  const now = await loadApproval(ctx.db, ctx.orgId, row.id).catch(() => null);
  return { ok: false, reason: "nothing_to_dismiss", error: t("aiApprovals.errors.nothingToDismiss"), row: now };
}
