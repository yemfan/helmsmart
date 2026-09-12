/**
 * Autonomy gating for AI employees.
 *
 * Reads permissions.autonomy from the employee record and routes the proposed
 * work accordingly:
 *
 *   autonomous       → execute inside executeRun; returns "executed"
 *   act_with_approval → park the proposed work as an `ai_approvals` row (the
 *                       same approvals the Ask Mark panel and /home show) +
 *                       escalateRun + notify; returns "escalated" with the
 *                       approval's id. Nothing is sent here: the owner
 *                       decides from the "Needs your approval" list.
 *   suggest          → nothing is sent and no card is made, but the owner is
 *                       TOLD: the run is recorded as a suggestion and a
 *                       notification says what would have happened. A level
 *                       called "tell me what you'd do" that told nobody
 *                       anything was the same silence as being switched off.
 *
 * The level itself comes from `lib/ai-team/autonomy.ts`, so this path and
 * Mark's tool loop read one value the same way — the row when the owner has
 * set it, the roster's default when they have not.
 *
 * The caller supplies `execute(runId)` — the actual work callback. For
 * autonomous employees this is called with a fresh run id. For others it is
 * never called (the run is opened + immediately escalated/closed instead).
 *
 * With approval, a caller that can say exactly what it would do supplies
 * `propose`: it drafts the work without side effects and returns it as a
 * registry action the employee owns (Emma: `reply_to_text`, the reply she
 * would have sent). The owner's Approve then runs that action through
 * `decideApprovalCore` — fingerprint check, permission, claim — like any other
 * AI-team proposal. A caller without `propose` parks a manual card the owner
 * handles and marks done.
 *
 * Best-effort: errors inside `execute` or `propose` are caught and close the
 * run as "failed"; errors in the gating infrastructure itself are always
 * rethrown (they indicate a config problem, not a transient failure).
 */

import { createNotificationService } from "@/lib/notifications-service";
import { notifySlackApprovalPending } from "@/lib/integrations/slack";
import { insertApproval, type NewApproval } from "@/lib/ai-team/approvals";
import { autonomyOf } from "@/lib/ai-team/autonomy";
import type { ApprovalDetails } from "@/lib/ai-team/approval-view";
import {
  getEmployee,
  startRun,
  escalateRun,
  completeRun,
  failRun,
  type StartRunInput,
  type RunUsage,
} from "@helm/ai-workforce";
import type { SupabaseClient } from "@supabase/supabase-js";

type Db = SupabaseClient;

export type GatingStatus = "executed" | "escalated" | "skipped" | "no_employee";

export interface GatingResult {
  status: GatingStatus;
  runId?: string;
  approvalId?: string;
  /** The value returned by execute() on success. */
  value?: unknown;
}

/**
 * The work an act_with_approval employee drafted, as a registry action she
 * owns — in exactly the params and details that action's preview produces,
 * so the approval card fingerprints what approving would send.
 */
export interface GatedProposal {
  actionKey: string;
  params: Record<string, unknown>;
  summary: string;
  details: ApprovalDetails;
}

/** What drafting a proposal returned: the proposal (or null — nothing to approve) and what it cost. */
export interface DraftedProposal {
  proposal: GatedProposal | null;
  usage?: Pick<RunUsage, "tokensUsed" | "costCents">;
}

export interface GatingOptions {
  /** The work to run for autonomous employees. Must return RunUsage (tokens/cost/outcome). */
  execute: (runId: string) => Promise<RunUsage & { value?: unknown }>;
  /**
   * act_with_approval only: draft the concrete action to approve. Must not
   * send, book or otherwise act. `proposal: null` means there is nothing to
   * approve — no card; the run closes. Without it, a manual card is parked.
   */
  propose?: (ctx: { runId: string; employeeName: string }) => Promise<DraftedProposal>;
  /** StartRunInput fields beyond employeeId (channel, subjectType, subjectId). */
  runInput: Omit<StartRunInput, "employeeId">;
  /** Context shown to the owner in the approval notification. */
  approvalSubject: Record<string, unknown>;
  /** Which tool the employee would invoke (informational — recorded on the run). */
  toolKey: string;
  /** The tool's input arguments (informational). */
  toolInput: Record<string, unknown>;
  /** Human-readable description — a manual card's summary + the notification body. */
  description: string;
  /** Optional detail shown with a manual card (e.g. the drafted message the owner should send). */
  taskNote?: string;
}

/**
 * Enforce the employee's autonomy level and run (or queue) the work.
 *
 * Falls back to "no_employee" (without throwing) if the org hasn't seeded its
 * workforce yet or Emma is paused/draft — the caller should handle this gracefully
 * (e.g. fall back to the legacy non-engine path).
 */
export async function enforceAutonomy(
  db: Db,
  orgId: string,
  employeeSlug: string,
  opts: GatingOptions,
): Promise<GatingResult> {
  const employee = await getEmployee(db, orgId, employeeSlug);
  if (!employee || employee.status !== "active") {
    return { status: "no_employee" };
  }

  const autonomy = autonomyOf(employee, employeeSlug);

  // ── suggest: nothing happens, and the owner hears about it ───────────────
  if (autonomy === "suggest") {
    const runId = await startRun(db, orgId, { employeeId: employee.id, ...opts.runInput });
    await completeRun(db, orgId, runId, {
      status: "succeeded",
      outcome: { suggested: true, summary: opts.description },
    });
    await createNotificationService(orgId, {
      type: "system",
      title: `${employee.name} would have handled this`,
      // The caller's own sentence about the work, in whatever language it
      // arrived in — the same rule the approval notification follows.
      body: opts.description.slice(0, 120),
      titleKey: "notifications.events.employeeSuggested",
      params: { employee: employee.name },
      link: "/ai-team",
    });
    return { status: "skipped", runId };
  }

  // ── act_with_approval: park it for the owner's decision ────────────────────
  // Nothing external happens here. The proposed work becomes an `ai_approvals`
  // row — the one approvals object, shown on /home under "Needs your
  // approval".
  if (autonomy === "act_with_approval") {
    const runId = await startRun(db, orgId, { employeeId: employee.id, ...opts.runInput });
    const source = {
      kind: "autonomy_gate",
      run_id: runId,
      channel: opts.runInput.channel ?? null,
      subject_type: opts.runInput.subjectType ?? null,
      subject_id: opts.runInput.subjectId ?? null,
      subject: opts.approvalSubject,
    };

    let approvalInput: NewApproval;
    let usage: Pick<RunUsage, "tokensUsed" | "costCents"> = {};
    if (opts.propose) {
      // An action the registry runs: approving it sends, through the same
      // checks as everything Mark lines up.
      let drafted: DraftedProposal;
      try {
        drafted = await opts.propose({ runId, employeeName: employee.name });
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        await failRun(db, orgId, runId, msg);
        return { status: "skipped", runId };
      }
      usage = drafted.usage ?? {};
      if (!drafted.proposal) {
        await completeRun(db, orgId, runId, { status: "succeeded", ...usage, outcome: { proposed: false } });
        return { status: "skipped", runId };
      }
      const p = drafted.proposal;
      approvalInput = { employeeSlug, actionKey: p.actionKey, params: p.params, summary: p.summary, details: p.details, source };
    } else {
      // The employee's tool, which the AI-team registry does not run: the owner
      // handles it and marks it done (or declines it) rather than approving a send.
      approvalInput = {
        employeeSlug,
        actionKey: opts.toolKey,
        params: opts.toolInput,
        summary: opts.description,
        details: { kind: "manual", note: opts.taskNote ?? null },
        source,
      };
    }

    const approval = await insertApproval(db, orgId, approvalInput);
    await escalateRun(db, orgId, runId, `Waiting for the owner's approval: ${approvalInput.actionKey}`, {
      ...usage,
      outcome: { approval_id: approval.id },
    });
    await createNotificationService(orgId, {
      type: "system",
      title: `${employee.name} needs your approval`,
      // No body key: the summary is the caller's own sentence about the work
      // it wanted done, composed wherever the tool lives. It stays in
      // whatever language it arrived in.
      body: approvalInput.summary.slice(0, 120),
      titleKey: "notifications.events.employeeNeedsApproval",
      params: { employee: employee.name },
      link: "/home",
    });

    // Slack notification (fire-and-forget)
    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "";
    void notifySlackApprovalPending(orgId, {
      employeeName: employee.name,
      description: approvalInput.summary.slice(0, 200),
      approvalsUrl: `${appUrl}/home`,
    });

    return { status: "escalated", runId, approvalId: approval.id };
  }

  // ── autonomous: execute inside a tracked run ──────────────────────────────
  const runId = await startRun(db, orgId, { employeeId: employee.id, ...opts.runInput });
  try {
    const { value, ...usage } = await opts.execute(runId);
    // completeRun is called by the execute callback via executeRun — or explicitly
    // here if the caller opted for the thin gating path (no executeRun nesting).
    // We call it here to guarantee closure; if it was already called inside
    // executeRun, Supabase will overwrite with the same final status — harmless.
    await completeRun(db, orgId, runId, { status: "succeeded", ...usage });
    return { status: "executed", runId, value };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await failRun(db, orgId, runId, msg);
    return { status: "executed", runId }; // still "executed" (attempted); error logged in run
  }
}
