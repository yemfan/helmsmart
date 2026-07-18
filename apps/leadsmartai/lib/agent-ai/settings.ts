import { supabaseAdmin } from "@/lib/supabase/admin";
import type {
  AgentAiDefaultLanguage,
  AgentAiSettings,
  AgentAiSettingsRow,
  AiPersonality,
} from "./types";

export const DEFAULT_AGENT_AI_SETTINGS: AgentAiSettings = {
  personality: "friendly",
  defaultLanguage: "en",
  bilingualEnabled: false,
  styleNotes: null,
  brandColor: null,
};

function mapRow(row: AgentAiSettingsRow): AgentAiSettings {
  return {
    personality: row.personality,
    defaultLanguage: row.default_language,
    bilingualEnabled: Boolean(row.bilingual_enabled),
    styleNotes: row.style_notes,
    brandColor:
      typeof row.brand_color === "string" && row.brand_color.trim()
        ? row.brand_color
        : null,
  };
}

/**
 * Load per-agent AI style. Returns defaults when missing or on read error (fail-open for tone only).
 */
export async function getAgentAiSettings(agentId: string | null | undefined): Promise<AgentAiSettings> {
  const { settings } = await getAgentAiSettingsWithMeta(agentId);
  return settings;
}

/**
 * Same as {@link getAgentAiSettings} but exposes whether a DB row exists (for greeting tone fallback).
 */
export async function getAgentAiSettingsWithMeta(agentId: string | null | undefined): Promise<{
  settings: AgentAiSettings;
  hasRow: boolean;
}> {
  if (!agentId) {
    return { settings: { ...DEFAULT_AGENT_AI_SETTINGS }, hasRow: false };
  }

  try {
    const { data, error } = await supabaseAdmin
      .from("agent_ai_settings")
      .select(
        "id, agent_id, personality, default_language, bilingual_enabled, style_notes, brand_color, created_at, updated_at"
      )
      .eq("agent_id", agentId as never)
      .maybeSingle();

    if (error || !data) {
      return { settings: { ...DEFAULT_AGENT_AI_SETTINGS }, hasRow: false };
    }

    return { settings: mapRow(data as unknown as AgentAiSettingsRow), hasRow: true };
  } catch {
    return { settings: { ...DEFAULT_AGENT_AI_SETTINGS }, hasRow: false };
  }
}

export type UpsertAgentAiSettingsInput = {
  personality?: AiPersonality;
  defaultLanguage?: AgentAiDefaultLanguage;
  bilingualEnabled?: boolean;
  styleNotes?: string | null;
  brandColor?: string | null;
};

export async function upsertAgentAiSettings(
  agentId: string,
  input: UpsertAgentAiSettingsInput
): Promise<AgentAiSettings> {
  const current = await getAgentAiSettings(agentId);
  const next: AgentAiSettings = {
    personality: input.personality ?? current.personality,
    defaultLanguage: input.defaultLanguage ?? current.defaultLanguage,
    bilingualEnabled: input.bilingualEnabled ?? current.bilingualEnabled,
    styleNotes: input.styleNotes !== undefined ? input.styleNotes : current.styleNotes,
    brandColor: input.brandColor !== undefined ? input.brandColor : current.brandColor,
  };

  const now = new Date().toISOString();
  const { error } = await supabaseAdmin.from("agent_ai_settings").upsert(
    {
      agent_id: agentId as never,
      personality: next.personality,
      default_language: next.defaultLanguage,
      bilingual_enabled: next.bilingualEnabled,
      style_notes: next.styleNotes,
      brand_color: next.brandColor,
      updated_at: now,
    } as never,
    { onConflict: "agent_id" }
  );

  if (error) throw error;
  return next;
}

/**
 * Effective greeting tone: canonical `agent_ai_settings.personality` when a row exists; else greeting automation tone.
 */
export function resolveGreetingTone(params: {
  agentAi: AgentAiSettings;
  greetingAutomationTone: "friendly" | "professional" | "luxury";
  hasAgentAiRow: boolean;
}): "friendly" | "professional" | "luxury" {
  if (params.hasAgentAiRow) return params.agentAi.personality;
  return params.greetingAutomationTone;
}
