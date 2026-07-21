"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { AgentVoiceSettings, VoicePresetOption, VoiceProvider } from "@/lib/agent-voice/types";
import { DEFAULT_AGENT_VOICE_SETTINGS } from "@/lib/agent-voice/voiceDefaults";
import { findPreset, listPresetsForProvider } from "@/lib/agent-voice/presets";
import { resolveTwilioVoicePlayback } from "@/lib/agent-voice/resolvePlayback";
import { VOICE_BILINGUAL_GREETING_EN } from "@/lib/ai-call/voice-scripts";

const defaults: AgentVoiceSettings = { ...DEFAULT_AGENT_VOICE_SETTINGS };

export default function AgentVoiceSettingsPanel() {
  const [settings, setSettings] = useState<AgentVoiceSettings>(defaults);
  const [savedSettings, setSavedSettings] = useState<AgentVoiceSettings>(defaults);
  const [presets, setPresets] = useState<VoicePresetOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const isDirty =
    settings.provider !== savedSettings.provider ||
    settings.presetVoiceId !== savedSettings.presetVoiceId ||
    settings.speakingStyle !== savedSettings.speakingStyle ||
    settings.defaultLanguage !== savedSettings.defaultLanguage ||
    settings.bilingualEnabled !== savedSettings.bilingualEnabled;

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/dashboard/agent-voice-settings", { method: "GET" });
      const data = (await res.json()) as {
        ok?: boolean;
        settings?: AgentVoiceSettings;
        presets?: VoicePresetOption[];
        error?: string;
      };
      if (!res.ok || !data.ok || !data.settings) {
        throw new Error(data.error || "Failed to load");
      }
      setSettings(data.settings);
      setSavedSettings(data.settings);
      setPresets(data.presets ?? []);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Load failed");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const previewPlayback = useMemo(() => resolveTwilioVoicePlayback(settings), [settings]);
  const activePreset = useMemo(
    () => findPreset(settings.provider, settings.presetVoiceId),
    [settings.provider, settings.presetVoiceId]
  );

  async function save() {
    setSaving(true);
    setMessage(null);
    setError(null);
    try {
      const res = await fetch("/api/dashboard/agent-voice-settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          provider: settings.provider,
          presetVoiceId: settings.presetVoiceId,
          speakingStyle: settings.speakingStyle,
          defaultLanguage: settings.defaultLanguage,
          bilingualEnabled: settings.bilingualEnabled,
        }),
      });
      const data = (await res.json()) as {
        ok?: boolean;
        settings?: AgentVoiceSettings;
        presets?: VoicePresetOption[];
        error?: string;
      };
      if (!res.ok || !data.ok || !data.settings) {
        throw new Error(data.error || "Save failed");
      }
      setSettings(data.settings);
      setSavedSettings(data.settings);
      setPresets(data.presets ?? []);
      setMessage("Saved.");
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  function setProvider(p: VoiceProvider) {
    const list = listPresetsForProvider(p);
    const firstId = list[0]?.id ?? "openai_alloy";
    setPresets(list);
    setSettings((s) => ({ ...s, provider: p, presetVoiceId: firstId }));
  }

  if (loading) {
    return (
      <div className="text-sm text-gray-500 py-4" aria-busy="true">
        Loading phone voice settings…
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-xs text-gray-600">
        Choose the voice for your CloseBoss phone assistant. Calls use Twilio speech today; OpenAI and
        ElevenLabs presets map to Amazon Polly voices until native TTS is connected. Assistant disclosure
        scripts are unchanged.
      </p>

      <div className="space-y-1">
        <span className="block text-[11px] font-medium text-gray-500">Provider</span>
        <div className="flex flex-wrap gap-2">
          {(["openai", "elevenlabs"] as const).map((p) => (
            <label
              key={p}
              className={`inline-flex items-center gap-2 rounded-lg border px-3 py-2 cursor-pointer text-sm ${
                settings.provider === p
                  ? "border-brand-accent bg-brand-accent/5"
                  : "border-gray-200 hover:border-gray-300"
              }`}
            >
              <input
                type="radio"
                name="voiceProvider"
                checked={settings.provider === p}
                onChange={() => setProvider(p)}
                className="accent-brand-accent"
              />
              <span className="capitalize">{p === "elevenlabs" ? "ElevenLabs" : "OpenAI"}</span>
            </label>
          ))}
        </div>
      </div>

      <div className="space-y-1">
        <label className="block text-[11px] font-medium text-gray-500">Preset voice</label>
        <select
          className="w-full max-w-md border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white"
          value={settings.presetVoiceId}
          onChange={(e) => setSettings((s) => ({ ...s, presetVoiceId: e.target.value }))}
        >
          {presets.map((opt) => (
            <option key={opt.id} value={opt.id}>
              {opt.label} — {opt.description}
            </option>
          ))}
        </select>
      </div>

      <div className="space-y-1">
        <span className="block text-[11px] font-medium text-gray-500">Speaking style</span>
        <div className="flex flex-wrap gap-2">
          {(["friendly", "professional", "luxury"] as const).map((st) => (
            <label
              key={st}
              className={`inline-flex items-center gap-2 rounded-lg border px-3 py-2 cursor-pointer text-sm capitalize ${
                settings.speakingStyle === st
                  ? "border-brand-accent bg-brand-accent/5"
                  : "border-gray-200 hover:border-gray-300"
              }`}
            >
              <input
                type="radio"
                name="speakingStyle"
                checked={settings.speakingStyle === st}
                onChange={() => setSettings((s) => ({ ...s, speakingStyle: st }))}
                className="accent-brand-accent"
              />
              {st}
            </label>
          ))}
        </div>
      </div>

      <div className="space-y-1">
        <label className="block text-[11px] font-medium text-gray-500">
          Default language (when bilingual is off)
        </label>
        <select
          className="w-full max-w-xs border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white"
          value={settings.defaultLanguage}
          onChange={(e) =>
            setSettings((s) => ({
              ...s,
              defaultLanguage: e.target.value as AgentVoiceSettings["defaultLanguage"],
            }))
          }
        >
          <option value="en">English</option>
          <option value="zh">Chinese (Simplified)</option>
        </select>
      </div>

      <label className="flex items-center gap-2 text-sm cursor-pointer">
        <input
          type="checkbox"
          checked={settings.bilingualEnabled}
          onChange={(e) => setSettings((s) => ({ ...s, bilingualEnabled: e.target.checked }))}
          className="accent-brand-accent"
        />
        <span>Bilingual inbound greeting (English + Chinese)</span>
      </label>

      <div className="rounded-lg border border-dashed border-gray-200 bg-gray-50/80 p-3 space-y-2">
        <div className="text-[11px] font-semibold text-gray-600">Custom voice (future)</div>
        <p className="text-[11px] text-gray-500">
          Voice cloning will use <span className="font-mono">voice_clone_*</span> columns on your agent row.
          Not available yet — preset voices only.
        </p>
      </div>

      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => void save()}
          disabled={saving || !isDirty}
          className="rounded-lg bg-brand-accent text-white text-sm font-medium px-4 py-2 disabled:opacity-50"
        >
          {saving ? "Saving…" : "Save"}
        </button>
        {message ? <span className="text-sm text-green-700">{message}</span> : null}
        {error ? <span className="text-sm text-red-600">{error}</span> : null}
      </div>

      <div className="border-t border-gray-100 pt-4 space-y-2">
        <div className="text-sm font-semibold text-gray-700">Preview (Twilio playback)</div>
        <p className="text-[11px] text-gray-500">
          English: <span className="font-mono text-gray-700">{previewPlayback.voiceEn}</span> · Chinese:{" "}
          <span className="font-mono text-gray-700">{previewPlayback.voiceZh}</span>
          {previewPlayback.ratePercent ? (
            <>
              {" "}
              · Rate: <span className="font-mono">{previewPlayback.ratePercent}</span>
            </>
          ) : null}
        </p>
        <p className="text-[11px] text-gray-600">
          Disclosure sample (always included on calls):{" "}
          <span className="italic text-gray-800">{VOICE_BILINGUAL_GREETING_EN}</span>
        </p>
        {activePreset ? (
          <p className="text-[10px] text-gray-500">
            Future OpenAI Realtime voice id: <span className="font-mono">{activePreset.openaiVoiceId}</span>
            {settings.provider === "elevenlabs" ? (
              <>
                {" "}
                · ElevenLabs preset ref: <span className="font-mono">{activePreset.elevenLabsVoiceId}</span>
              </>
            ) : null}
          </p>
        ) : null}
      </div>
    </div>
  );
}
