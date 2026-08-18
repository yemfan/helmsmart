"use server";

import { revalidatePath } from "next/cache";

import { getCurrentAgentContext } from "@/lib/dashboardService";
import { setPlaybookAutoSettings, type PlaybookAutoSettings } from "@/lib/closeboss/playbook-runs/service";

/** Toggle an auto-start setting for playbook runs. */
export async function setPlaybookAutoAction(input: Partial<PlaybookAutoSettings>): Promise<PlaybookAutoSettings> {
  const ctx = await getCurrentAgentContext();
  const next = await setPlaybookAutoSettings(ctx.agentId, input);
  revalidatePath("/dashboard/playbook-runs");
  return next;
}
