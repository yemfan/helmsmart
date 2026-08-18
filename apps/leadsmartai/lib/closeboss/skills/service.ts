import "server-only";

import { supabaseAdmin } from "@/lib/supabase/admin";
import { SKILLS, type Skill, type SkillAssignee } from "./catalog";
import { getStateCompliance, type StateCompliance } from "./compliance";

/**
 * Skills service — resolves the catalog against per-agent overrides and the
 * agent's licensed state (for compliance parameterization).
 */

const VALID_ASSIGNEES: SkillAssignee[] = [
  "boss",
  "receptionist",
  "sales_assistant",
  "marketing_assistant",
  "transaction_assistant",
  "accountant",
];

export type ResolvedSkill = Skill & { enabled: boolean; assignee: SkillAssignee };

type SkillOverride = { enabled?: boolean; assignee?: SkillAssignee };
type OverrideMap = Record<string, SkillOverride>;

/**
 * The agent's licensed state code (e.g. "CA") for compliance. Authoritative
 * source: their onboarding primary market (agents.service_areas_v2[0].state).
 * Falls back to an IP-detected region when the market isn't set, then blank
 * (generic, state-aware compliance).
 */
export async function resolveAgentStateCode(agentId: string, ipRegion?: string | null): Promise<string> {
  try {
    const { data } = await supabaseAdmin
      .from("agents")
      .select("service_areas_v2")
      .eq("id", agentId)
      .maybeSingle();
    const areas = (data as { service_areas_v2?: Array<{ state?: string | null }> | null } | null)?.service_areas_v2;
    const fromMarket = Array.isArray(areas) ? areas.find((a) => a?.state)?.state : null;
    if (fromMarket && fromMarket.trim()) return fromMarket.trim().toUpperCase();
  } catch {
    /* fall through to IP / generic */
  }
  return (ipRegion ?? "").trim().toUpperCase();
}

export async function getAgentStateCompliance(agentId: string, ipRegion?: string | null): Promise<StateCompliance> {
  return getStateCompliance(await resolveAgentStateCode(agentId, ipRegion));
}

async function readOverrides(agentId: string): Promise<OverrideMap> {
  try {
    const { data } = await supabaseAdmin
      .from("agent_skill_overrides")
      .select("overrides")
      .eq("agent_id", agentId)
      .maybeSingle();
    const o = (data as { overrides?: OverrideMap } | null)?.overrides;
    return o && typeof o === "object" ? o : {};
  } catch {
    return {};
  }
}

/** Every skill with its effective (override-applied) enabled + assignee. */
export async function getResolvedSkills(agentId: string): Promise<ResolvedSkill[]> {
  const overrides = await readOverrides(agentId);
  return SKILLS.map((s) => {
    const ov = overrides[s.id] ?? {};
    const assignee =
      ov.assignee && VALID_ASSIGNEES.includes(ov.assignee) ? ov.assignee : s.defaultAssignee;
    const enabled = typeof ov.enabled === "boolean" ? ov.enabled : true;
    return { ...s, enabled, assignee };
  });
}

/** Enabled skills owned by an assistant (effective assignment) — for skill execution. */
export async function getSkillsForAssistant(agentId: string, assignee: SkillAssignee): Promise<ResolvedSkill[]> {
  return (await getResolvedSkills(agentId)).filter((s) => s.enabled && s.assignee === assignee);
}

/** Set (or clear) one agent's override for a skill. Returns the updated map. */
export async function setSkillOverride(
  agentId: string,
  skillId: string,
  patch: SkillOverride,
): Promise<OverrideMap> {
  if (!SKILLS.some((s) => s.id === skillId)) throw new Error("Unknown skill");
  if (patch.assignee && !VALID_ASSIGNEES.includes(patch.assignee)) throw new Error("Invalid assignee");

  const overrides = await readOverrides(agentId);
  const current = overrides[skillId] ?? {};
  const next: SkillOverride = { ...current };
  if (patch.enabled !== undefined) next.enabled = patch.enabled;
  if (patch.assignee !== undefined) next.assignee = patch.assignee;
  overrides[skillId] = next;

  await supabaseAdmin
    .from("agent_skill_overrides")
    .upsert({ agent_id: agentId, overrides, updated_at: new Date().toISOString() }, { onConflict: "agent_id" });
  return overrides;
}
