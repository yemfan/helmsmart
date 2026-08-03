import { supabaseAdmin } from "@/lib/supabase/admin";
import { findPreset, listPresetsForProvider } from "./presets";
import type {
  AgentVoiceSettings,
  AgentVoiceSettingsRow,
  VoiceCloneStatus,
  VoiceDefaultLanguage,
  VoiceProvider,
  VoiceSpeakingStyle,
} from "./types";
import { DEFAULT_AGENT_VOICE_SETTINGS } from "./voiceDefaults";

export { DEFAULT_AGENT_VOICE_SETTINGS };

function mapRow(row: AgentVoiceSettingsRow): AgentVoiceSettings {
  return {
    provider: row.provider,
    presetVoiceId: row.preset_voice_id,
    speakingStyle: row.speaking_style,
    defaultLanguage: row.default_language,
    bilingualEnabled: Boolean(row.bilingual_enabled),
    voiceCloneProvider: row.voice_clone_provider,
    voiceCloneRemoteId: row.voice_clone_remote_id,
    voiceCloneStatus: row.voice_clone_status,
    consentConfirmed: Boolean(row.consent_confirmed),
    consentConfirmedAt: row.consent_confirmed_at,
    voiceCloneSampleStoragePath: row.voice_clone_sample_storage_path,
    voiceClonePreviewStoragePath: row.voice_clone_preview_storage_path,
    voiceCloneError: row.voice_clone_error,
    useClonedVoice: Boolean(row.use_cloned_voice),
    voiceClonePreviewAcknowledgedAt: row.voice_clone_preview_acknowledged_at,
    voiceLines: row.voice_lines ?? null,
  };
}

function normalizePreset(provider: VoiceProvider, presetId: string): string {
  const hit = findPreset(provider, presetId);
  if (hit) return hit.id;
  const first = listPresetsForProvider(provider)[0];
  return first?.id ?? DEFAULT_AGENT_VOICE_SETTINGS.presetVoiceId;
}

export async function getAgentVoiceSettings(agentId: string | null | undefined): Promise<AgentVoiceSettings> {
  if (!agentId) return { ...DEFAULT_AGENT_VOICE_SETTINGS };

  try {
    const { data, error } = await supabaseAdmin
      .from("agent_voice_settings")
      .select(
        "id, agent_id, provider, preset_voice_id, speaking_style, default_language, bilingual_enabled, voice_clone_provider, voice_clone_remote_id, voice_clone_status, consent_confirmed, consent_confirmed_at, voice_clone_sample_storage_path, voice_clone_preview_storage_path, voice_clone_error, use_cloned_voice, voice_clone_preview_acknowledged_at, voice_lines, created_at, updated_at"
      )
      .eq("agent_id", agentId as never)
      .maybeSingle();

    if (error || !data) {
      return { ...DEFAULT_AGENT_VOICE_SETTINGS };
    }

    const mapped = mapRow(data as unknown as AgentVoiceSettingsRow);
    return {
      ...mapped,
      presetVoiceId: normalizePreset(mapped.provider, mapped.presetVoiceId),
    };
  } catch {
    return { ...DEFAULT_AGENT_VOICE_SETTINGS };
  }
}

export type UpsertAgentVoiceSettingsInput = {
  provider?: VoiceProvider;
  presetVoiceId?: string;
  speakingStyle?: VoiceSpeakingStyle;
  defaultLanguage?: VoiceDefaultLanguage;
  bilingualEnabled?: boolean;
};

export async function upsertAgentVoiceSettings(
  agentId: string,
  input: UpsertAgentVoiceSettingsInput
): Promise<AgentVoiceSettings> {
  const current = await getAgentVoiceSettings(agentId);
  const provider = input.provider ?? current.provider;
  const presetVoiceId = normalizePreset(provider, input.presetVoiceId ?? current.presetVoiceId);

  const next: AgentVoiceSettings = {
    provider,
    presetVoiceId,
    speakingStyle: input.speakingStyle ?? current.speakingStyle,
    defaultLanguage: input.defaultLanguage ?? current.defaultLanguage,
    bilingualEnabled: input.bilingualEnabled ?? current.bilingualEnabled,
    voiceCloneProvider: current.voiceCloneProvider,
    voiceCloneRemoteId: current.voiceCloneRemoteId,
    voiceCloneStatus: current.voiceCloneStatus,
    consentConfirmed: current.consentConfirmed,
    consentConfirmedAt: current.consentConfirmedAt,
    voiceCloneSampleStoragePath: current.voiceCloneSampleStoragePath,
    voiceClonePreviewStoragePath: current.voiceClonePreviewStoragePath,
    voiceCloneError: current.voiceCloneError,
    useClonedVoice: current.useClonedVoice,
    voiceClonePreviewAcknowledgedAt: current.voiceClonePreviewAcknowledgedAt,
    voiceLines: current.voiceLines,
  };

  const now = new Date().toISOString();
  const { error } = await supabaseAdmin.from("agent_voice_settings").upsert(
    {
      agent_id: agentId as never,
      provider: next.provider,
      preset_voice_id: next.presetVoiceId,
      speaking_style: next.speakingStyle,
      default_language: next.defaultLanguage,
      bilingual_enabled: next.bilingualEnabled,
      voice_clone_provider: next.voiceCloneProvider,
      voice_clone_remote_id: next.voiceCloneRemoteId,
      voice_clone_status: next.voiceCloneStatus as VoiceCloneStatus | null,
      consent_confirmed: next.consentConfirmed,
      consent_confirmed_at: next.consentConfirmedAt,
      voice_clone_sample_storage_path: next.voiceCloneSampleStoragePath,
      voice_clone_preview_storage_path: next.voiceClonePreviewStoragePath,
      voice_clone_error: next.voiceCloneError,
      use_cloned_voice: next.useClonedVoice,
      voice_clone_preview_acknowledged_at: next.voiceClonePreviewAcknowledgedAt,
      updated_at: now,
    } as never,
    { onConflict: "agent_id" }
  );

  if (error) throw error;
  return next;
}

export type PatchVoiceCloneFieldsInput = Partial<{
  voiceCloneStatus: VoiceCloneStatus | null;
  voiceCloneRemoteId: string | null;
  voiceCloneError: string | null;
  useClonedVoice: boolean;
}>;

/** Partial update for clone job worker (does not replace full settings row). */
export async function patchVoiceCloneFields(
  agentId: string,
  patch: PatchVoiceCloneFieldsInput
): Promise<void> {
  const row: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (patch.voiceCloneStatus !== undefined) row.voice_clone_status = patch.voiceCloneStatus;
  if (patch.voiceCloneRemoteId !== undefined) row.voice_clone_remote_id = patch.voiceCloneRemoteId;
  if (patch.voiceCloneError !== undefined) row.voice_clone_error = patch.voiceCloneError;
  if (patch.useClonedVoice !== undefined) row.use_cloned_voice = patch.useClonedVoice;

  const { error } = await supabaseAdmin.from("agent_voice_settings").update(row as never).eq("agent_id", agentId);
  if (error) throw error;
}
