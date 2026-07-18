"use server";

import { getCurrentAgentContext } from "@/lib/dashboardService";
import { runSkill, type RunSkillResult } from "@/lib/realtyboss/skills/run";

/** Run one skill with the given inputs; auto-fills agent + compliance placeholders. */
export async function runSkillAction(skillId: string, inputs: Record<string, string>): Promise<RunSkillResult> {
  const ctx = await getCurrentAgentContext();
  return runSkill(ctx.agentId, skillId, inputs);
}
