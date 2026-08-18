"use server";

import { revalidatePath } from "next/cache";

import { getCurrentAgentContext } from "@/lib/dashboardService";
import { setSkillOverride } from "@/lib/closeboss/skills/service";
import type { SkillAssignee } from "@/lib/closeboss/skills/catalog";

export type SkillOverridePatch = { enabled?: boolean; assignee?: SkillAssignee };

/** Enable/disable or reassign one skill for the current agent. */
export async function setSkillOverrideAction(
  skillId: string,
  patch: SkillOverridePatch,
): Promise<{ ok: boolean; error?: string }> {
  const ctx = await getCurrentAgentContext();
  try {
    await setSkillOverride(ctx.agentId, skillId, patch);
    revalidatePath("/dashboard/skills");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Couldn't save." };
  }
}
