/**
 * Autonomy gating for AI employees.
 *
 * Reads permissions.autonomy from the employee record and routes the proposed
 * work accordingly:
 *
 *   autonomous       → execute inside executeRun; returns "executed"
 *   act_with_approval → create a to-do TASK for the owner + escalateRun + notify;
 *                       returns "escalated". No external action is taken — the
 *                       owner reads the task and acts manually. (We deliberately
 *                       dropped the separate Approvals inbox + approve-and-send.)
 *   suggest          → no side effects; returns "skipped"
 *
 * The caller supplies `execute(runId)` — the actual work callback. For
 * autonomous employees this is called with a fresh run id. For others it is
 * never called (the run is opened + immediately escalated/closed instead).
 *
 * Best-effort: errors inside `execute` are caught and close the run as "failed";
 * errors in the gating infrastructure itself are always rethrown (they indicate
 * a config problem, not a transient failure).
 */

import { createNotificationService } from "@/lib/actions/notifications";
import { insertTask } from "@helm/dna-operations";
import { notifySlackApprovalPending } from "@/lib/integrations/slack";
import {
  getEmployee,
  startRun,
  escalateRun,
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

export interface GatingOptions {
  /** The work to run for autonomous employees. Must return RunUsage (tokens/cost/outcome). */
  execute: (runId: string) => Promise<RunUsage & { value?: unknown }>;
  /** StartRunInput fields beyond employeeId (channel, subjectType, subjectId). */
  runInput: Omit<StartRunInput, "employeeId">;
  /** Context shown to the owner in the approval notification. */
  approvalSubject: Record<string, unknown>;
  /** Which tool the employee would invoke (informational — recorded on the run). */
  toolKey: string;
  /** The tool's input arguments (informational). */
  toolInput: Record<string, unknown>;
  /** Human-readable description — becomes the task title + notification body. */
  description: string;
  /** Optional detail for the task notes (e.g. the drafted message the owner should send). */
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

  const autonomy = employee.permissions.autonomy ?? "autonomous";

  // ── suggest: propose only, no execution ──────────────────────────────────
  if (autonomy === "suggest") {
    return { status: "skipped" };
  }

  // ── act_with_approval: hand off to the owner as a to-do task ───────────────
  // No external action is taken. The employee's suggestion becomes a task the
  // owner can read and act on, instead of a separate approve-and-send inbox.
  if (autonomy === "act_with_approval") {
    const runId = await startRun(db, orgId, { employeeId: employee.id, ...opts.runInput });
    const clientId =
      opts.runInput.subjectType === "contact" ? opts.runInput.subjectId ?? undefined : undefined;
    await insertTask(db, orgId, {
      title: opts.description,
      notes: opts.taskNote,
      client_id: clientId,
      priority: "high",
    });
    await escalateRun(db, orgId, runId, `Handed off to the owner as a task: ${opts.toolKey}`);
    await createNotificationService(orgId, {
      type: "system",
      title: `${employee.name} created a task for you`,
      // No body key: `description` is the caller's own sentence about the work
      // it wanted done, composed wherever the tool lives. It is the task's
      // title too, and it stays in whatever language it arrived in.
      body: opts.description.slice(0, 120),
      titleKey: "notifications.events.employeeCreatedTask",
      params: { employee: employee.name },
      link: "/tasks",
    });

    // Slack notification (fire-and-forget)
    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "";
    void notifySlackApprovalPending(orgId, {
      employeeName: employee.name,
      description: opts.description.slice(0, 200),
      approvalsUrl: `${appUrl}/tasks`,
    });

    return { status: "escalated", runId };
  }

  // ── autonomous: execute inside a tracked run ──────────────────────────────
  const runId = await startRun(db, orgId, { employeeId: employee.id, ...opts.runInput });
  try {
    const { value, ...usage } = await opts.execute(runId);
    // completeRun is called by the execute callback via executeRun — or explicitly
    // here if the caller opted for the thin gating path (no executeRun nesting).
    // We call it here to guarantee closure; if it was already called inside
    // executeRun, Supabase will overwrite with the same final status — harmless.
    const { completeRun } = await import("@helm/ai-workforce");
    await completeRun(db, orgId, runId, { status: "succeeded", ...usage });
    return { status: "executed", runId, value };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await failRun(db, orgId, runId, msg);
    return { status: "executed", runId }; // still "executed" (attempted); error logged in run
  }
}
