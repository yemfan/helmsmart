import { supabaseAdmin } from "@/lib/supabase/admin";
import { AI_TEAM, type AssistantType } from "@/lib/realtyboss/team";
import { DEFAULT_ASSISTANT_AVATARS, defaultAvatarForType } from "@/lib/realtyboss/avatars";
import {
  BOSS_ASSISTANT_SYSTEM_PROMPT,
  RECEPTIONIST_SYSTEM_PROMPT,
  SALES_ASSISTANT_SYSTEM_PROMPT,
  MARKETING_ASSISTANT_SYSTEM_PROMPT,
  TRANSACTION_ASSISTANT_SYSTEM_PROMPT,
  ACCOUNTANT_SYSTEM_PROMPT,
} from "@/lib/ai/prompts/realtyboss";

export type AiAssistantRow = {
  id: string;
  agent_id: string;
  type: AssistantType;
  name: string;
  avatar_id: string;
  /** Custom uploaded avatar URL; overrides avatar_id when set. */
  avatar_url: string | null;
  status: "active" | "paused";
  description: string | null;
  persona_prompt: string | null;
  enabled_skills: string[];
  created_at: string;
  updated_at: string;
};

const DEFAULT_PROMPTS: Record<AssistantType, string> = {
  boss_assistant: BOSS_ASSISTANT_SYSTEM_PROMPT,
  receptionist: RECEPTIONIST_SYSTEM_PROMPT,
  sales_assistant: SALES_ASSISTANT_SYSTEM_PROMPT,
  marketing_assistant: MARKETING_ASSISTANT_SYSTEM_PROMPT,
  transaction_assistant: TRANSACTION_ASSISTANT_SYSTEM_PROMPT,
  accountant: ACCOUNTANT_SYSTEM_PROMPT,
};

function mapRow(r: Record<string, unknown>): AiAssistantRow {
  const type = r.type as AssistantType;
  return {
    id: String(r.id),
    agent_id: String(r.agent_id),
    type,
    name: String(r.name ?? ""),
    avatar_id:
      typeof r.avatar_id === "string" && r.avatar_id ? r.avatar_id : defaultAvatarForType(type),
    avatar_url: typeof r.avatar_url === "string" && r.avatar_url ? r.avatar_url : null,
    status: (r.status === "paused" ? "paused" : "active") as "active" | "paused",
    description: (r.description as string | null) ?? null,
    persona_prompt: (r.persona_prompt as string | null) ?? null,
    enabled_skills: Array.isArray(r.enabled_skills) ? (r.enabled_skills as string[]) : [],
    created_at: String(r.created_at ?? ""),
    updated_at: String(r.updated_at ?? ""),
  };
}

/**
 * Get-or-create the agent's AI team rows. Missing types are seeded
 * from the lib/realtyboss/team.ts roster so existing agents pick up
 * the team on first visit without a backfill migration.
 */
export async function ensureAssistantsForAgent(agentId: string): Promise<AiAssistantRow[]> {
  const { data, error } = await supabaseAdmin
    .from("ai_assistants")
    .select("*")
    .eq("agent_id", agentId);
  if (error) throw new Error(error.message);

  const existing = (data ?? []).map(mapRow);
  const missing = AI_TEAM.filter((def) => !existing.some((row) => row.type === def.type));
  if (missing.length === 0) {
    return existing.sort(byRosterOrder);
  }

  const inserts = missing.map((def) => ({
    agent_id: agentId,
    type: def.type,
    // Seed the persona name (Max, Emma, …); `def.name` is the role label.
    name: def.displayName,
    avatar_id: DEFAULT_ASSISTANT_AVATARS[def.type],
    status: "active",
    description: `${def.role} — ${def.mission}`,
    persona_prompt: DEFAULT_PROMPTS[def.type],
    enabled_skills: [...def.skills],
  }));

  // Two ensure calls can race (e.g. dashboard + team page in parallel
  // tabs); the (agent_id, type) unique key makes the second a no-op.
  const { data: inserted, error: insertErr } = await supabaseAdmin
    .from("ai_assistants")
    .upsert(inserts as Record<string, unknown>[], { onConflict: "agent_id,type", ignoreDuplicates: true })
    .select("*");
  if (insertErr) throw new Error(insertErr.message);

  return [...existing, ...((inserted ?? []).map(mapRow))].sort(byRosterOrder);
}

function byRosterOrder(a: AiAssistantRow, b: AiAssistantRow): number {
  const order = AI_TEAM.map((d) => d.type);
  return order.indexOf(a.type) - order.indexOf(b.type);
}

export async function updateAssistantForAgent(
  agentId: string,
  type: AssistantType,
  patch: {
    status?: "active" | "paused";
    enabledSkills?: string[];
    avatarId?: string;
    /** string = set custom photo URL; null = remove it (revert to persona). */
    avatarUrl?: string | null;
  },
): Promise<AiAssistantRow> {
  const body: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (patch.status) body.status = patch.status;
  if (patch.enabledSkills) body.enabled_skills = patch.enabledSkills;
  if (patch.avatarId) {
    // Choosing a built-in persona clears any custom uploaded photo.
    body.avatar_id = patch.avatarId;
    body.avatar_url = null;
  }
  if (patch.avatarUrl !== undefined) body.avatar_url = patch.avatarUrl;

  const { data, error } = await supabaseAdmin
    .from("ai_assistants")
    .update(body)
    .eq("agent_id", agentId)
    .eq("type", type)
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  return mapRow(data as Record<string, unknown>);
}

/** Assistant types the agent has paused — used to filter recommendations/activity. */
export async function pausedAssistantTypes(agentId: string): Promise<Set<AssistantType>> {
  const { data, error } = await supabaseAdmin
    .from("ai_assistants")
    .select("type,status")
    .eq("agent_id", agentId)
    .eq("status", "paused");
  if (error) throw new Error(error.message);
  return new Set(((data ?? []) as { type: AssistantType }[]).map((r) => r.type));
}
