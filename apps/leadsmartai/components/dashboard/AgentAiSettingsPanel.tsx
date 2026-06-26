"use client";

import { useCallback, useEffect, useState } from "react";
import type { AgentAiSettings } from "@/lib/agent-ai/types";
import { listOutboundEnabled } from "@/lib/locales/registry";
import { PersonalityPreview } from "./PersonalityPreview";

const empty: AgentAiSettings = {
  personality: "friendly",
  defaultLanguage: "en",
  bilingualEnabled: false,
  styleNotes: null,
};

export default function AgentAiSettingsPanel() {
  const [settings, setSettings] = useState<AgentAiSettings>(empty);
  const [savedSettings, setSavedSettings] = useState<AgentAiSettings>(empty);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const isDirty =
    settings.personality !== savedSettings.personality ||
    settings.defaultLanguage !== savedSettings.defaultLanguage ||
    settings.bilingualEnabled !== savedSettings.bilingualEnabled ||
    (settings.styleNotes ?? "") !== (savedSettings.styleNotes ?? "");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/dashboard/agent-ai-settings", { method: "GET" });
      const data = (await res.json()) as { ok?: boolean; settings?: AgentAiSettings; error?: string };
      if (!res.ok || !data.ok || !data.settings) {
        throw new Error(data.error || "Failed to load");
      }
      setSettings(data.settings);
      setSavedSettings(data.settings);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Load failed");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function save() {
    setSaving(true);
    setMessage(null);
    setError(null);
    try {
      const res = await fetch("/api/dashboard/agent-ai-settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          personality: settings.personality,
          defaultLanguage: settings.defaultLanguage,
          bilingualEnabled: settings.bilingualEnabled,
          styleNotes: settings.styleNotes,
        }),
      });
      const data = (await res.json()) as { ok?: boolean; settings?: AgentAiSettings; error?: string };
      if (!res.ok || !data.ok || !data.settings) {
        throw new Error(data.error || "Save failed");
      }
      setSettings(data.settings);
      setSavedSettings(data.settings);
      setMessage("Saved.");
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="text-sm text-gray-500 py-4" aria-busy="true">
        Loading AI assistant style…
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-xs text-gray-600">
        Choose how RealtyBoss sounds for SMS, email, call summaries, and automated greetings. This adjusts
        tone and wording only — compliance and safety rules are unchanged.
      </p>

      <div className="space-y-2">
        <span className="block text-[11px] font-medium text-gray-500">Personality</span>
        <div className="flex flex-wrap gap-2">
          {(["friendly", "professional", "luxury"] as const).map((p) => (
            <label
              key={p}
              className={`inline-flex items-center gap-2 rounded-lg border px-3 py-2 cursor-pointer text-sm ${
                settings.personality === p
                  ? "border-brand-accent bg-brand-accent/5"
                  : "border-gray-200 hover:border-gray-300"
              }`}
            >
              <input
                type="radio"
                name="personality"
                checked={settings.personality === p}
                onChange={() => setSettings((s) => ({ ...s, personality: p }))}
                className="accent-brand-accent"
              />
              <span className="capitalize">{p}</span>
            </label>
          ))}
        </div>
      </div>

      <div className="space-y-1">
        <label className="block text-[11px] font-medium text-gray-500">Default outbound language</label>
        <select
          className="w-full max-w-xs border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white"
          value={settings.defaultLanguage}
          onChange={(e) =>
            setSettings((s) => ({
              ...s,
              defaultLanguage: e.target.value as AgentAiSettings["defaultLanguage"],
            }))
          }
        >
          {/* Registry-driven: adding a new locale (es, ja…) to
              lib/locales/registry.ts with outbound.enabled=true surfaces
              it here automatically. No manual maintenance of this list. */}
          {listOutboundEnabled().map((l) => (
            <option key={l.id} value={l.id}>
              {l.label}
              {l.nativeLabel !== l.label ? ` (${l.nativeLabel})` : ""}
            </option>
          ))}
          <option value="auto">Auto (match lead)</option>
        </select>
        <p className="text-[11px] text-gray-500">
          The AI uses this when a contact has no preferred language set. Override per-contact on the Contacts page.
        </p>
      </div>

      <label className="flex items-center gap-2 text-sm cursor-pointer">
        <input
          type="checkbox"
          checked={settings.bilingualEnabled}
          onChange={(e) => setSettings((s) => ({ ...s, bilingualEnabled: e.target.checked }))}
          className="accent-brand-accent"
        />
        <span>Bilingual assistant (English / 中文)</span>
      </label>

      <div className="space-y-1">
        <label className="block text-[11px] font-medium text-gray-500">
          Custom style notes <span className="text-gray-400 font-normal">(optional, max 500 chars)</span>
        </label>
        <textarea
          className="w-full min-h-[88px] border border-gray-300 rounded-lg px-3 py-2 text-sm"
          placeholder="e.g. Prefer Oxford comma; avoid exclamation marks; mention our team name once."
          maxLength={500}
          value={settings.styleNotes ?? ""}
          onChange={(e) => setSettings((s) => ({ ...s, styleNotes: e.target.value || null }))}
        />
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

      <div className="border-t border-gray-100 pt-4">
        <div className="text-sm font-semibold text-gray-700">Preview ({settings.personality})</div>
        <PersonalityPreview personality={settings.personality} />
      </div>
    </div>
  );
}
