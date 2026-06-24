import type { AiPipelinePlan } from "./types";
import { getStageBySlug } from "./stages";
import { createTask } from "./tasks";
import { updateLeadPipelineStage } from "./leadStage";
import { logEngagementEvent } from "@/lib/contacts/logEngagementEvent";
import { supabaseServer } from "@/lib/supabaseServer";

function dueIso(dueInDays: number | null | undefined): string | null {
  if (dueInDays == null || !Number.isFinite(dueInDays)) return null;
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + Math.max(0, Math.min(365, Math.round(dueInDays))));
  return d.toISOString();
}

export async function applyAiPipelinePlan(params: {
  agentId: string;
  leadId: string;
  plan: AiPipelinePlan;
}): Promise<{ createdTaskIds: string[]; stageUpdated: boolean }> {
  const { agentId, leadId, plan } = params;
  const createdTaskIds: string[] = [];

  let stageId: string | null = null;
  if (plan.recommendedStageSlug) {
    const stage = await getStageBySlug(agentId, plan.recommendedStageSlug);
    if (stage) {
      await updateLeadPipelineStage({ agentId, leadId, pipelineStageId: stage.id });
      stageId = stage.id;
    }
  }
  if (!stageId) {
    const { data: leadRow } = await supabaseServer
      .from("contacts")
      .select("pipeline_stage_id")
      .eq("id", leadId as any)
      .eq("agent_id", agentId as any)
      .maybeSingle();
    stageId = ((leadRow as any)?.pipeline_stage_id as string | null) ?? null;
  }

  const summary = (plan.summary || "").trim();
  for (const t of plan.tasks ?? []) {
    const title = (t.title || "").trim();
    if (!title) continue;
    const row = await createTask({
      agentId,
      leadId,
      pipelineStageId: stageId,
      title,
      description: t.description?.trim() || null,
      priority: t.priority ?? "normal",
      dueAt: dueIso(t.dueInDays ?? null),
      source: "ai",
      aiRationale: summary ? summary.slice(0, 2000) : null,
    });
    createdTaskIds.push(row.id);
  }

  if (createdTaskIds.length) {
    await logEngagementEvent(String(leadId), "ai_pipeline_tasks_created", {
      source: "ai",
      payload: { count: createdTaskIds.length, task_ids: createdTaskIds },
    });
  }

  return {
    createdTaskIds,
    stageUpdated: Boolean(plan.recommendedStageSlug && stageId),
  };
}
