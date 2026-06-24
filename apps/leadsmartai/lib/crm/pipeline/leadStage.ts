import { supabaseServer } from "@/lib/supabaseServer";
import { logEngagementEvent } from "@/lib/contacts/logEngagementEvent";

export async function updateLeadPipelineStage(params: {
  agentId: string;
  leadId: string;
  pipelineStageId: string | null;
}): Promise<{ previousStageId: string | null }> {
  const { data: lead, error: leadErr } = await supabaseServer
    .from("contacts")
    .select("id,agent_id,pipeline_stage_id")
    .eq("id", params.leadId as any)
    .eq("agent_id", params.agentId as any)
    .maybeSingle();

  if (leadErr) throw new Error(leadErr.message);
  if (!lead) throw new Error("Lead not found.");

  const prev = ((lead as any).pipeline_stage_id as string | null) ?? null;
  const next = params.pipelineStageId;
  if (prev === next || (prev == null && next == null)) {
    return { previousStageId: prev };
  }

  if (params.pipelineStageId) {
    const { data: stage, error: stErr } = await supabaseServer
      .from("crm_pipeline_stages")
      .select("id,agent_id")
      .eq("id", params.pipelineStageId)
      .maybeSingle();
    if (stErr) throw new Error(stErr.message);
    if (!stage || String((stage as any).agent_id) !== String(params.agentId)) {
      throw new Error("Invalid pipeline stage.");
    }
  }

  const { error: upErr } = await supabaseServer
    .from("contacts")
    .update({ pipeline_stage_id: params.pipelineStageId } as any)
    .eq("id", params.leadId as any)
    .eq("agent_id", params.agentId as any);

  if (upErr) throw new Error(upErr.message);

  await logEngagementEvent(String(params.leadId), "pipeline_stage_change", {
    source: "crm",
    payload: {
      from_stage_id: prev,
      to_stage_id: params.pipelineStageId,
    },
  });

  return { previousStageId: prev };
}
