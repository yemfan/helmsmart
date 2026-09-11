/**
 * `runAction` — the ONLY way Mark's tool loop runs an action. The rules live
 * here, in code, not in the prompt:
 *
 *   - unknown action or invalid input → a failure the model can read;
 *   - outbound → preview (entities re-checked against the org), then an
 *     `ai_approvals` row. `execute` is never called from here, so a confused
 *     or prompt-injected model cannot send anything — by construction;
 *   - read / internal → the caller's role must carry the action's permission,
 *     any preview must pass, then it runs; internal work is recorded as the
 *     employee's run (the AI activity feed reads it).
 *
 * Dependencies are injected so the tests and the eval harness can run the
 * real rules over synthetic data. Production wiring: `defaultRunDeps` in
 * `./registry.ts`.
 */
import { hasPermission } from "@/lib/permissions";
import type { EmployeeRunRecord } from "@/lib/workforce-attribution";
import type { ApprovalRow } from "./approval-view";
import type { NewApproval } from "./approvals";
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
    if (action.riskClass === "outbound") {
      // The send path is unreachable from here. Preview, then park.
      if (!action.preview) return { status: "failed", error: `${action.key} is outbound but has no preview.` };
      const preview = await action.preview(params, ctx);
      if (!preview.ok) return { status: "rejected", reason: preview.reason };
      const approval = await deps.createApproval(ctx.db, ctx.orgId, {
        employeeSlug: action.employee,
        actionKey: action.key,
        params: params as Record<string, unknown>,
        summary: preview.summary,
        details: preview.details,
        source: { ...source, proposed_by: ctx.userId },
      });
      return { status: "proposed", summary: preview.summary, approval };
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
