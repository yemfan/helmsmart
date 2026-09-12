/**
 * `runAction` — the ONLY way Mark's tool loop runs an action. The rules live
 * here, in code, not in the prompt:
 *
 *   - unknown action or invalid input → a failure the model can read;
 *   - read → runs at once. Reading is not an act; no dial governs it;
 *   - anything that writes → the dial the owner set for the action's OWNER
 *     decides (`./autonomy.ts`):
 *       suggest            nothing happens and no card is made. The model is
 *                          told to say what it would have done instead;
 *       act_with_approval  outbound → preview (entities re-checked against the
 *                          org), then an `ai_approvals` row. `execute` is never
 *                          called on this branch, so a confused or
 *                          prompt-injected model cannot send anything;
 *       autonomous         outbound → the proposal is made and then run down
 *                          the same path the owner's Approve takes — fresh
 *                          preview, fingerprint match, one-winner claim
 *                          (`decideApprovalCore`). The row is the record, so
 *                          the send shows in the AI activity feed like any
 *                          other;
 *   - internal work (a task, a hand-off) runs once the dial is past "suggest"
 *     and the caller's role carries the action's permission, and is recorded as
 *     the employee's run.
 *
 * Dependencies are injected so the tests and the eval harness can run the
 * real rules over synthetic data. Production wiring: `defaultRunDeps` in
 * `./registry.ts` — the two dial dependencies default to the real ones here,
 * so nothing has to be wired to get the real behaviour.
 */
import { hasPermission } from "@/lib/permissions";
import type { EmployeeRunRecord } from "@/lib/workforce-attribution";
import { pickDetails, type ApprovalDetails, type ApprovalRow } from "./approval-view";
import type { NewApproval } from "./approvals";
import { storedAutonomy, type AutonomyLevel } from "./autonomy";
import type { DecideCoreResult } from "./decide";
import type { ActionContext, AnyAction } from "./types";
import type { SupabaseClient } from "@supabase/supabase-js";

export type RunOutcome =
  | { status: "completed"; summary: string; data?: unknown }
  | { status: "proposed"; summary: string; approval: ApprovalRow }
  | { status: "rejected"; reason: string }
  | { status: "failed"; error: string };

export interface RunDeps {
  getAction: (key: string) => AnyAction | null;
  createApproval: (db: SupabaseClient, orgId: string, approval: NewApproval) => Promise<ApprovalRow>;
  recordRun: (db: SupabaseClient, orgId: string, slug: string, run: EmployeeRunRecord) => Promise<void>;
  /**
   * The dial the owner set for a teammate. Defaults to their stored row (the
   * roster default when the business has never touched it).
   */
  autonomyOf?: (ctx: ActionContext, slug: string) => Promise<AutonomyLevel>;
  /**
   * Run a proposal the owner already said yes to by setting the dial to "go
   * ahead". Defaults to `decideApprovalCore` — the same path the Approve
   * button takes, checks and all. It is handed the preview's details so it can
   * fingerprint exactly what the card would have shown.
   */
  approve?: (
    ctx: ActionContext,
    approval: ApprovalRow,
    details: ApprovalDetails,
    deps: RunDeps,
  ) => Promise<DecideCoreResult>;
}

/**
 * Approving on the owner's behalf, loaded only when a dial is on "go ahead".
 *
 * `./decide` reaches `./fingerprint.server`, which is `server-only` — a static
 * import would make every module that merely wants to RUN a read action
 * unloadable outside a server context, tests and the eval harness included.
 */
async function approveNow(
  ctx: ActionContext,
  approval: ApprovalRow,
  details: ApprovalDetails,
  deps: RunDeps,
): Promise<DecideCoreResult> {
  const [{ decideApprovalCore }, { approvalFingerprint }] = await Promise.all([
    import("./decide"),
    import("./fingerprint.server"),
  ]);
  return decideApprovalCore(
    ctx,
    approval.id,
    "approve",
    { fingerprint: approvalFingerprint(approval.action_key, pickDetails(details)) },
    { getAction: deps.getAction, recordRun: deps.recordRun },
  );
}

export async function runAction(
  ctx: ActionContext,
  key: string,
  rawInput: unknown,
  deps: RunDeps,
  source: Record<string, unknown> = {},
): Promise<RunOutcome> {
  const action = deps.getAction(key);
  if (!action) {
    return {
      status: "failed",
      error: `There is no tool named "${key}". Don't invent tools — if the team can't do this yet, use hand_off_to_owner with category capability_gap.`,
    };
  }

  const parsed = action.input.safeParse(rawInput ?? {});
  if (!parsed.success) {
    return {
      status: "failed",
      error: `Invalid input for ${action.key}: ${parsed.error.issues
        .map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`)
        .join("; ")}`,
    };
  }
  const params = parsed.data;

  try {
    // The dial only governs work that writes. A read is never held back.
    const teammate = ctx.team[action.employee]?.name ?? action.employee;
    const autonomy =
      action.riskClass === "read"
        ? "autonomous"
        : await (deps.autonomyOf ?? ((c, slug) => storedAutonomy(c.db, c.orgId, slug)))(ctx, action.employee);

    if (autonomy === "suggest") {
      // Nothing happens and nothing is queued — the owner asked to be told, so
      // telling them is the whole job. `outcomeForModel` marks this final.
      return {
        status: "rejected",
        reason:
          `${teammate} is set to "suggest only", so nothing was done and nothing is waiting for approval. ` +
          `Tell the owner exactly what ${teammate} would have done — who it involves and what it would say — ` +
          `and that they can change ${teammate}'s dial on the AI Team page to have it done for real.`,
      };
    }

    if (action.riskClass === "outbound") {
      if (!action.preview) return { status: "failed", error: `${action.key} is outbound but has no preview.` };
      const preview = await action.preview(params, ctx);
      if (!preview.ok) return { status: "rejected", reason: preview.reason };
      const mayRun = !!ctx.role && hasPermission(ctx.role, action.permission);
      const goAhead = autonomy === "autonomous" && mayRun;
      const approval = await deps.createApproval(ctx.db, ctx.orgId, {
        employeeSlug: action.employee,
        actionKey: action.key,
        params: params as Record<string, unknown>,
        summary: preview.summary,
        details: preview.details,
        source: { ...source, proposed_by: ctx.userId, autonomy, ...(goAhead ? { went_ahead: true } : {}) },
      });
      // "Ask me first" — and anyone whose role could not send it themselves.
      // The send path is unreachable from here: `execute` is never called.
      if (!goAhead) return { status: "proposed", summary: preview.summary, approval };

      // "Go ahead": the owner said yes in advance. Run it the way their click
      // would have — the preview is taken again, the fingerprints must agree,
      // and exactly one claim wins.
      const decided = await (deps.approve ?? approveNow)(ctx, approval, preview.details, deps);
      if (decided.ok) {
        return { status: "completed", summary: preview.summary, data: { approval_id: approval.id, went_ahead: true } };
      }
      return {
        status: "failed",
        error:
          `${teammate} is set to go ahead, but ${action.key} did not get through: ${decided.error} ` +
          `It is on the owner's approvals list as a proposal; do not try again.`,
      };
    }

    if (!ctx.role || !hasPermission(ctx.role, action.permission)) {
      return {
        status: "rejected",
        reason: `The signed-in member's role (${ctx.role ?? "none"}) can't do this — it needs ${action.permission}. Tell them an owner or admin can.`,
      };
    }
    if (action.preview) {
      const preview = await action.preview(params, ctx);
      if (!preview.ok) return { status: "rejected", reason: preview.reason };
    }

    const result = await action.execute(params, ctx);
    if (result.status === "done") {
      if (action.riskClass === "internal" && result.run) {
        await deps.recordRun(ctx.db, ctx.orgId, action.employee, {
          status: result.run.status,
          channel: result.run.channel,
          subjectType: result.run.subject?.type ?? null,
          subjectId: result.run.subject?.id ?? null,
          outcome: result.run.outcome,
        });
      }
      return { status: "completed", summary: result.summary, data: result.data };
    }
    return result.status === "rejected" ? { status: "rejected", reason: result.reason } : { status: "failed", error: result.error };
  } catch (e) {
    console.error(`[ai-team] ${action.key} failed:`, e);
    return { status: "failed", error: `${action.key} hit an error and did nothing. Tell the owner it didn't work and suggest trying again.` };
  }
}

/** A run outcome as the tool result the model reads next round. */
export function outcomeForModel(outcome: RunOutcome): string {
  switch (outcome.status) {
    case "completed":
      return JSON.stringify({ status: "completed", summary: outcome.summary, data: outcome.data ?? null });
    case "proposed":
      return JSON.stringify({
        status: "proposed",
        approval_id: outcome.approval.id,
        summary: outcome.summary,
        note: "Parked for the owner's approval as a card in this chat. NOTHING has been sent. This is success: do not call it again. Tell the owner who will send what and that it's waiting for their approval below.",
      });
    case "rejected":
      return JSON.stringify({
        status: "rejected",
        reason: outcome.reason,
        note: "Final — do not retry. Tell the owner the reason plainly.",
      });
    case "failed":
      return JSON.stringify({ status: "failed", error: outcome.error });
  }
}
