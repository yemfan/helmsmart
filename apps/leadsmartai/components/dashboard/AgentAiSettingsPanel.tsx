"use client";

import { useCallback, useEffect, useState } from "react";
import AdvancedSection from "@/components/dashboard/AdvancedSection";
import { useTranslation } from "react-i18next";
import type { AgentAiSettings } from "@/lib/agent-ai/types";
import { listOutboundEnabled } from "@/lib/locales/registry";
import { PersonalityPreview } from "./PersonalityPreview";

const empty: AgentAiSettings = {
  personality: "friendly",
  defaultLanguage: "en",
  bilingualEnabled: false,
  styleNotes: null,
  brandColor: null,
};

/** #RGB or #RRGGBB (with or without leading #). Empty is allowed (= default). */
function isValidHex(v: string): boolean {
  const raw = v.trim();
  if (!raw) return true;
  return /^#?([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(raw);
}

export default function AgentAiSettingsPanel({
  canCustomizeBrand = false,
}: {
  /** Signature-tier: unlocks the brand color input (else disabled + upgrade hint). */
  canCustomizeBrand?: boolean;
}) {
  const { t } = useTranslation("dashboard");
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
    (settings.styleNotes ?? "") !== (savedSettings.styleNotes ?? "") ||
    (settings.brandColor ?? "") !== (savedSettings.brandColor ?? "");

  const brandColorInvalid = !isValidHex(settings.brandColor ?? "");

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
          // Brand color is Signature-gated server-side; only include it when the
          // plan unlocks it (the server also re-checks + silently ignores otherwise).
          ...(canCustomizeBrand
            ? { brandColor: settings.brandColor?.trim() ? settings.brandColor.trim() : null }
            : {}),
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
      <div className="text-sm text-slate-500 py-4" aria-busy="true">
        {t("pages.agentAiSettings.loading")}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-xs text-slate-600 dark:text-slate-400">{t("pages.agentAiSettings.intro")}</p>

      <div className="space-y-2">
        <span className="block text-[11px] font-medium text-slate-500">{t("pages.agentAiSettings.personality")}</span>
        <div className="flex flex-wrap gap-2">
          {(["friendly", "professional", "luxury"] as const).map((p) => (
            <label
              key={p}
              className={`inline-flex items-center gap-2 rounded-lg border px-3 py-2 cursor-pointer text-sm ${
                settings.personality === p
                  ? "border-brand-accent bg-brand-accent/5"
                  : "border-slate-200 dark:border-slate-700 hover:border-slate-300"
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
        <label htmlFor="agentaisettingspanel-1" className="block text-[11px] font-medium text-slate-500">{t("pages.agentAiSettings.outboundLanguage")}</label>
        <select id="agentaisettingspanel-1"
          className="w-full max-w-xs border border-slate-300 dark:border-slate-700 rounded-lg px-3 py-2 text-sm bg-white dark:bg-slate-900"
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
          <option value="auto">{t("pages.agentAiSettings.autoMatch")}</option>
        </select>
        <p className="text-[11px] text-slate-500">{t("pages.agentAiSettings.languageHint")}</p>
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

      {/* The long tail: free text, a colour, and a read-only sample. Real
          settings, but not what anyone opens this panel for — they were
          sitting at the same weight as the personality choice that actually
          changes how every message reads. */}
      <AdvancedSection count={3}>
        <div className="space-y-1">
          <label htmlFor="agentaisettingspanel-2" className="block text-[11px] font-medium text-slate-500">{t("pages.agentAiSettings.styleNotes")}<span className="text-slate-500 font-normal">(optional, max 500 chars)</span>
          </label>
          <textarea id="agentaisettingspanel-2"
            className="w-full min-h-[88px] border border-slate-300 dark:border-slate-700 rounded-lg px-3 py-2 text-sm"
            placeholder={t("pages.agentAiSettings.stylePlaceholder")}
            maxLength={500}
            value={settings.styleNotes ?? ""}
            onChange={(e) => setSettings((s) => ({ ...s, styleNotes: e.target.value || null }))}
          />
        </div>

        <div className="space-y-1 border-t border-slate-100 dark:border-slate-700 pt-4">
          <div className="flex items-center justify-between">
            <label className="block text-[11px] font-medium text-slate-500" htmlFor="brand-color">{t("pages.dashFragments.brandColor")}{" "}
              <span className="font-normal text-slate-500">(social cards)</span>
            </label>
            {!canCustomizeBrand && (
              <span className="rounded-full bg-[#0072ce]/10 px-2 py-0.5 text-[10px] font-medium text-[#0072ce]">{t("pages.agentAiSettings.signature")}</span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <input
              type="color"
              aria-label={t("pages.agentAiSettings.swatch")}
              disabled={!canCustomizeBrand}
              value={
                settings.brandColor && isValidHex(settings.brandColor)
                  ? (settings.brandColor.startsWith("#") ? settings.brandColor : `#${settings.brandColor}`)
                  : "#0072ce"
              }
              onChange={(e) => setSettings((s) => ({ ...s, brandColor: e.target.value }))}
              className="h-9 w-12 shrink-0 cursor-pointer rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 p-1 disabled:cursor-not-allowed disabled:opacity-50"
            />
            <input
              id="brand-color"
              type="text"
              inputMode="text"
              disabled={!canCustomizeBrand}
              placeholder="#0072ce (default)"
              maxLength={7}
              value={settings.brandColor ?? ""}
              onChange={(e) =>
                setSettings((s) => ({ ...s, brandColor: e.target.value || null }))
              }
              className="w-32 rounded-lg border border-slate-300 dark:border-slate-700 px-3 py-2 text-sm disabled:bg-slate-50 disabled:text-slate-400"
            />
            {settings.brandColor && (
              <button
                type="button"
                disabled={!canCustomizeBrand}
                onClick={() => setSettings((s) => ({ ...s, brandColor: null }))}
                className="text-[11px] text-slate-500 underline-offset-2 hover:underline disabled:opacity-50"
              >{t("pages.agentAiSettings.reset")}</button>
            )}
          </div>
          {canCustomizeBrand ? (
            <p className="text-[11px] text-slate-500">{t("pages.agentAiSettings.accentHint")}</p>
          ) : (
            <p className="text-[11px] text-slate-500">{t("pages.dashFragments.ownBrandColor")}{" "}
              <a href="/dashboard/billing" className="font-medium text-[#0072ce] underline hover:no-underline">{t("pages.agentAiSettings.signature")}</a>
              .
            </p>
          )}
          {canCustomizeBrand && brandColorInvalid && (
            <p className="text-[11px] text-red-600">Enter a valid hex color like #0072ce.</p>
          )}
        </div>

        <div className="border-t border-slate-100 dark:border-slate-700 pt-4">
          <div className="text-sm font-semibold text-slate-700 dark:text-slate-300">{t("pages.dashFragments.preview")}{settings.personality})</div>
          <PersonalityPreview personality={settings.personality} />
        </div>
      </AdvancedSection>

      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => void save()}
          disabled={saving || !isDirty || (canCustomizeBrand && brandColorInvalid)}
          className="rounded-lg bg-brand-accent text-white text-sm font-medium px-4 py-2 disabled:opacity-50"
        >
          {saving ? t("common:status.saving") : t("common:actions.save")}
        </button>
        {message ? <span className="text-sm text-green-700">{message}</span> : null}
        {error ? <span className="text-sm text-red-600">{error}</span> : null}
      </div>
    </div>
  );
}
