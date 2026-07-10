"use server";

import { revalidatePath } from "next/cache";

import { getCurrentAgentContext } from "@/lib/dashboardService";
import { optimizePlaybookRun, type OptimizeResult } from "@/lib/realtyboss/playbook-runs/service";

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
