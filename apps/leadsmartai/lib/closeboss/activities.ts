import { supabaseAdmin } from "@/lib/supabase/admin";
import type { AssistantType } from "@/lib/closeboss/team";

export type AssistantActivityRow = {
  id: string;
  agent_id: string;
  assistant_type: AssistantType;
  activity_type: string;
  summary: string;
  outcome: string | null;
  priority: "low" | "normal" | "high";
  requires_attention: boolean;
  related_entity_type: string | null;
  related_entity_id: string | null;
  created_at: string;
};

/**
 * Record an AI-team activity. Fire-and-forget: callers sit on hot
 * paths (Twilio webhooks, missed-call handler), so a logging failure
 * must never fail the underlying flow.
 */
export async function logAssistantActivity(input: {
  agentId: string;
  assistantType: AssistantType;
  activityType: string;
  summary: string;
  outcome?: string | null;
  priority?: "low" | "normal" | "high";
  requiresAttention?: boolean;
  relatedEntityType?: string | null;
  relatedEntityId?: string | null;
}): Promise<void> {
  try {
    const { error } = await supabaseAdmin.from("assistant_activities").insert({
      agent_id: input.agentId,
      assistant_type: input.assistantType,
      activity_type: input.activityType,
      summary: input.summary,
      outcome: input.outcome ?? null,
      priority: input.priority ?? "normal",
      requires_attention: input.requiresAttention ?? false,
      related_entity_type: input.relatedEntityType ?? null,
      related_entity_id: input.relatedEntityId ?? null,
    });
    if (error) {
      console.warn("[closeboss] logAssistantActivity insert failed:", error.message);
    }
  } catch (e) {
    console.warn("[closeboss] logAssistantActivity threw:", e);
  }
}

export async function listAssistantActivities(
  agentId: string,
  limit = 20,
): Promise<AssistantActivityRow[]> {
  const { data, error } = await supabaseAdmin
    .from("assistant_activities")
    .select("*")
    .eq("agent_id", agentId)
    .order("created_at", { ascending: false })
    .limit(Math.min(Math.max(limit, 1), 100));
  if (error) throw new Error(error.message);
  return (data ?? []) as AssistantActivityRow[];
}
