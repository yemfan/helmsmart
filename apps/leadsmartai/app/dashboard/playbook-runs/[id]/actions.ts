"use server";

import { revalidatePath } from "next/cache";

import { getCurrentAgentContext } from "@/lib/dashboardService";
import { optimizePlaybookRun, type OptimizeResult } from "@/lib/realtyboss/playbook-runs/service";
import { dispatchPlaybookTask, type DispatchResult } from "@/lib/realtyboss/playbook-runs/dispatch";

/**
 * Agent-approved "optimize as we go" step. Runs the AI review, records the
 * proposed adjustments on the run, and files an approval task. The agent still
 * approves before anything acts.
 */
export async function optimizeRunAction(runId: string, note: string): Promise<OptimizeResult> {
  const ctx = await getCurrentAgentContext();
  const res = await optimizePlaybookRun(ctx.agentId, runId, note);
  if (res.ok) revalidatePath(`/dashboard/playbook-runs/${runId}`);
  return res;
}

/**
 * Agent's "Approve & run" — hand one executable execute-task to its AI assistant
 * to run now (post the ads, turn on the recurring search). Approval-gated:
 * this is the explicit go-ahead when the assistant isn't already on autopilot.
 */
export async function runPlaybookTaskAction(runId: string, taskId: string): Promise<DispatchResult> {
  const ctx = await getCurrentAgentContext();
  const res = await dispatchPlaybookTask(ctx.agentId, taskId);
  if (res.ok) revalidatePath(`/dashboard/playbook-runs/${runId}`);
  return res;
}
