"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  DEFAULT_RECEPTIONIST_CONFIG,
  type ReceptionistConfig,
} from "@/lib/voice-receptionist/types";
import {
  defaultBusinessHours,
  DAY_KEYS,
  DAY_LABELS,
  type BusinessHours,
  type DayKey,
} from "@repo/voice";

const defaults: ReceptionistConfig = { ...DEFAULT_RECEPTIONIST_CONFIG };

const FIELD =
  "w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-accent/40";
const LABEL = "block text-[11px] font-medium text-gray-500 mb-1";

export default function VoiceReceptionistSettingsPanel() {
  const { t } = useTranslation("dashboard");
  const [settings, setSettings] = useState<ReceptionistConfig>(defaults);
  const [saved, setSaved] = useState<ReceptionistConfig>(defaults);
  const [hours, setHours] = useState<BusinessHours | null>(null);
  const [savedHours, setSavedHours] = useState<BusinessHours | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const configDirty = (Object.keys(settings) as (keyof ReceptionistConfig)[]).some(
    (k) => settings[k] !== saved[k],
  );
  const hoursDirty = JSON.stringify(hours) !== JSON.stringify(savedHours);
  const isDirty = configDirty || hoursDirty;
  const displayHours = hours ?? defaultBusinessHours();

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/dashboard/voice-receptionist-settings", { method: "GET" });
      const data = (await res.json()) as {
        ok?: boolean;
        settings?: ReceptionistConfig;
        businessHours?: BusinessHours | null;
        error?: string;
      };
      if (!res.ok || !data.ok || !data.settings) throw new Error(data.error || "Failed to load");
      setSettings(data.settings);
      setSaved(data.settings);
      setHours(data.businessHours ?? null);
      setSavedHours(data.businessHours ?? null);
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
      const res = await fetch("/api/dashboard/voice-receptionist-settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...settings, businessHours: hours }),
      });
      const data = (await res.json()) as {
        ok?: boolean;
        settings?: ReceptionistConfig;
        businessHours?: BusinessHours | null;
        error?: string;
      };
      if (!res.ok || !data.ok || !data.settings) throw new Error(data.error || "Save failed");
      setSettings(data.settings);
      setSaved(data.settings);
      setHours(data.businessHours ?? null);
      setSavedHours(data.businessHours ?? null);
      setMessage("Saved.");
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  function update<K extends keyof ReceptionistConfig>(key: K, value: ReceptionistConfig[K]) {
    setSettings((s) => ({ ...s, [key]: value }));
    setMessage(null);
  }

  function setDay(day: DayKey, val: { open: string; close: string } | null) {
    setHours((prev) => ({ ...(prev ?? defaultBusinessHours()), [day]: val }));
    setMessage(null);
  }

  if (loading) {
    return (
      <div className="text-sm text-gray-500 py-4" aria-busy="true">
        Loading receptionist settings…
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-xs text-gray-600">{t("pages.voiceReceptionist.intro")}</p>

      <label className="flex items-center gap-2 text-sm text-gray-800">
        <input
          type="checkbox"
          checked={settings.enabled}
          onChange={(e) => update("enabled", e.target.checked)}
          className="h-4 w-4 rounded border-gray-300"
        />
        <span>{t("pages.voiceSettings.enabled")}</span>
        {!settings.enabled && (
          <span className="text-[11px] text-amber-600">{t("pages.voiceSettings.disabledHint")}</span>
        )}
      </label>

      <div>
        <span className={LABEL}>{t("pages.voiceSettings.phone")}</span>
        <input
          className={FIELD}
          value={settings.phoneNumber}
          onChange={(e) => update("phoneNumber", e.target.value)}
          placeholder={t("pages.voiceSettings.phonePlaceholder")}
        />
        <p className="mt-1 text-[11px] text-gray-400">{t("pages.voiceReceptionist.routingNote")}</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <span className={LABEL}>{t("pages.voiceSettings.businessName")}</span>
          <input
            className={FIELD}
            value={settings.businessName}
            onChange={(e) => update("businessName", e.target.value)}
            placeholder={t("pages.voiceSettings.businessNamePlaceholder")}
          />
        </div>
        <div>
          <span className={LABEL}>{t("pages.voiceSettings.businessNameZh")}</span>
          <input
            className={FIELD}
            value={settings.businessNameZh}
            onChange={(e) => update("businessNameZh", e.target.value)}
            placeholder="中文名称（可选）"
          />
        </div>
        <div>
          <span className={LABEL}>{t("pages.voiceSettings.receptionistName")}</span>
          <input
            className={FIELD}
            value={settings.agentName}
            onChange={(e) => update("agentName", e.target.value)}
            placeholder={t("pages.voiceSettings.receptionistNamePlaceholder")}
          />
        </div>
        <div>
          <span className={LABEL}>{t("pages.voiceSettings.timezone")}</span>
          <input
            className={FIELD}
            value={settings.timezone}
            onChange={(e) => update("timezone", e.target.value)}
            placeholder="America/New_York"
          />
        </div>
      </div>

      <div>
        <span className={LABEL}>{t("pages.voiceSettings.greeting")}</span>
        <input
          className={FIELD}
          value={settings.greeting}
          onChange={(e) => update("greeting", e.target.value)}
          placeholder={t("pages.voiceSettings.greetingPlaceholder")}
        />
      </div>

      <div>
        <span className={LABEL}>{t("pages.voiceSettings.knowledge")}</span>
        <textarea
          className={`${FIELD} min-h-[120px]`}
          value={settings.extraNotes}
          onChange={(e) => update("extraNotes", e.target.value)}
          placeholder={t("pages.voiceReceptionist.kbHint")}
        />
      </div>

      <div>
        <span className={LABEL}>{t("pages.voiceSettings.officeHours")}</span>
        <div className="space-y-1.5">
          {DAY_KEYS.map((d) => {
            const dh = displayHours[d];
            const open = Boolean(dh);
            return (
              <div key={d} className="flex items-center gap-2 text-sm">
                <span className="w-24 shrink-0 text-gray-700">{DAY_LABELS[d]}</span>
                <label className="flex w-20 shrink-0 items-center gap-1.5 text-[11px] text-gray-500">
                  <input
                    type="checkbox"
                    checked={open}
                    onChange={(e) => setDay(d, e.target.checked ? dh ?? { open: "09:00", close: "17:00" } : null)}
                    className="h-3.5 w-3.5 rounded border-gray-300"
                  />
                  {open ? t("pages.voiceSettings.open") : t("pages.voiceSettings.closed")}
                </label>
                {open && dh ? (
                  <div className="flex items-center gap-1.5">
                    <input
                      type="time"
                      aria-label={`${DAY_LABELS[d]} opening time`}
                      className="rounded border border-gray-300 px-2 py-1 text-xs"
                      value={dh.open}
                      onChange={(e) => setDay(d, { open: e.target.value, close: dh.close })}
                    />
                    <span className="text-gray-400">–</span>
                    <input
                      type="time"
                      aria-label={`${DAY_LABELS[d]} closing time`}
                      className="rounded border border-gray-300 px-2 py-1 text-xs"
                      value={dh.close}
                      onChange={(e) => setDay(d, { open: dh.open, close: e.target.value })}
                    />
                  </div>
                ) : (
                  <span className="text-[11px] text-gray-400">—</span>
                )}
              </div>
            );
          })}
        </div>
        <p className="mt-1 text-[11px] text-gray-400">{t("pages.voiceReceptionist.hoursHint")}</p>
      </div>

      <div>
        <span className={LABEL}>{t("pages.voiceSettings.outOfMinutes")}</span>
        <div className="space-y-1.5">
          <label className="flex items-start gap-2 text-sm text-gray-800">
            <input
              type="radio"
              name="voiceLimitBehavior"
              checked={settings.voiceLimitBehavior === "text_back"}
              onChange={() => update("voiceLimitBehavior", "text_back")}
              className="mt-0.5 h-4 w-4 border-gray-300"
            />
            <span>{t("pages.dashFragments.textCallersBack")}{" "}
              <span className="text-[11px] text-gray-400">
                — the AI stops answering live and sends an SMS instead (no extra charge)
              </span>
            </span>
          </label>
          <label className="flex items-start gap-2 text-sm text-gray-800">
            <input
              type="radio"
              name="voiceLimitBehavior"
              checked={settings.voiceLimitBehavior === "overage"}
              onChange={() => update("voiceLimitBehavior", "overage")}
              className="mt-0.5 h-4 w-4 border-gray-300"
            />
            <span>{t("pages.dashFragments.keepAiAnswering")}{" "}
              <span className="text-[11px] text-gray-400">
                — additional minutes billed at $0.25/min
              </span>
            </span>
          </label>
        </div>
        <p className="mt-1 text-[11px] text-gray-400">{t("pages.dashFragments.needMoreMinutes")}{" "}
          <a href="/agent/pricing" className="text-brand-accent-text underline underline-offset-2">
            Upgrade your plan →
          </a>
        </p>
      </div>

      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => void save()}
          disabled={!isDirty || saving}
          className="rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white transition-opacity disabled:opacity-50"
        >
          {saving ? t("pages.voiceSettings.saving") : t("pages.voiceSettings.save")}
        </button>
        {message && <span className="text-xs font-medium text-green-600">{message}</span>}
        {error && <span className="text-xs font-medium text-red-600">{error}</span>}
      </div>
    </div>
  );
}
