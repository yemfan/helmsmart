import "server-only";

import { supabaseAdmin } from "@/lib/supabase/admin";
import {
  buildVoicePlaybook,
  RECEPTIONIST_MESSAGE_PLAYBOOK,
  VOICE_GUARDRAILS,
  getAssistant,
  type AssistantType,
} from "@helm/pack-real-estate";

/**
 * Per-assistant voice identity. Each AI team member that talks on the
 * phone has its OWN call settings + knowledge base:
 *
 *   • voiceName       — the name it uses on live calls
 *   • voiceKnowledge  — what it may state as fact on its calls
 *   • enabledSkills   — which playbook lines it follows
 *
 * The Receptionist's number/greeting/hours stay in
 * voice_receptionist_settings (inbound config is richer); the fields
 * here are the assistant-level overlay, used directly by outbound
 * assistants (Sales Assistant).
 */

export type AssistantVoiceSettings = {
  voiceName: string | null;
  voiceKnowledge: string | null;
  enabledSkills: readonly string[];
};

export async function getAssistantVoiceSettings(
  agentId: string,
  type: AssistantType,
): Promise<AssistantVoiceSettings> {
  let skills: readonly string[] = getAssistant(type).skills;
  let voiceName: string | null = null;
  let voiceKnowledge: string | null = null;
  try {
    const { data } = await supabaseAdmin
      .from("ai_assistants")
      .select("name, enabled_skills, voice_name, voice_knowledge")
      .eq("agent_id", agentId)
      .eq("type", type)
      .maybeSingle();
    const row = data as {
      name?: string | null;
      enabled_skills?: unknown;
      voice_name?: string | null;
      voice_knowledge?: string | null;
    } | null;
    if (Array.isArray(row?.enabled_skills)) {
      skills = row.enabled_skills.filter((s): s is string => typeof s === "string");
    }
    // The assistant's display name (set on Manage Your AI Team) is the voice
    // name by default — no separate setup needed. An explicit voice_name
    // override still wins for anyone who set one.
    voiceName = row?.voice_name?.trim() || row?.name?.trim() || null;
    voiceKnowledge = row?.voice_knowledge?.trim() || null;
  } catch (e) {
    console.warn("[realtyboss] assistant voice lookup failed, using roster defaults:", e);
  }
  return { voiceName, voiceKnowledge, enabledSkills: skills };
}

/**
 * Behaviour block injected into an assistant's per-call system prompt
 * (as `ReceptionistContext.extraNotes`): the qualification/escalation
 * playbook from the skills enabled on THAT assistant, plus the
 * compliance guardrails. Falls back to the roster defaults when no
 * row exists; any failure degrades rather than failing the call.
 */
export async function buildAssistantVoiceNotes(
  agentId: string,
  type: AssistantType,
): Promise<string> {
  const { enabledSkills } = await getAssistantVoiceSettings(agentId, type);
  return voiceNotesFromSkills(enabledSkills);
}

/** Playbook + compliance block from an already-loaded skill list. */
export function voiceNotesFromSkills(enabledSkills: readonly string[]): string {
  const playbook = buildVoicePlaybook(enabledSkills);
  return [playbook, `## Compliance\n${VOICE_GUARDRAILS}`].filter(Boolean).join("\n\n");
}

/**
 * Inbound-call hot path — the Receptionist's playbook. Unlike outbound
 * assistants, the Receptionist always gets the message-taking rule
 * (record name/phone/reason on every call; for friends/family or a
 * service we don't offer, take a message and promise a Realtor
 * call-back) — so no caller is ever turned away cold.
 */
export async function buildReceptionistVoiceNotes(agentId: string): Promise<string> {
  const { enabledSkills } = await getAssistantVoiceSettings(agentId, "receptionist");
  return receptionistVoiceNotesFromSkills(enabledSkills);
}

/** Receptionist playbook block from an already-loaded skill list (adds the
 *  always-on message-taking rule that outbound assistants don't get). */
export function receptionistVoiceNotesFromSkills(enabledSkills: readonly string[]): string {
  const playbook = buildVoicePlaybook(enabledSkills);
  return [playbook, RECEPTIONIST_MESSAGE_PLAYBOOK, `## Compliance\n${VOICE_GUARDRAILS}`]
    .filter(Boolean)
    .join("\n\n");
}
