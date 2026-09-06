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
  "w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-accent/40";
const LABEL = "block text-[11px] font-medium text-slate-500 mb-1";

export default function VoiceReceptionistSettingsPanel() {
  const { t } = useTranslation("dashboard");
  const [settings, setSettings] = useState<ReceptionistConfig>(defaults);
  const [saved, setSaved] = useState<ReceptionistConfig>(defaults);
  const [hours, setHours] = useState<BusinessHours | null>(null);
  const [savedHours, setSavedHours] = useState<BusinessHours | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [brandName, setBrandName] = useState<string>("");
  const [brandDraft, setBrandDraft] = useState<string>("");
  const [error, setError] = useState<string | null>(null);

  const configDirty = (Object.keys(settings) as (keyof ReceptionistConfig)[]).some(
    (k) => settings[k] !== saved[k],
  );
  const hoursDirty = JSON.stringify(hours) !== JSON.stringify(savedHours);
  const isDirty = configDirty || hoursDirty;
  const displayHours = hours ?? defaultBusinessHours();

  // Derived, not stored: "every day, all day" IS 24/7, so there is nothing to
  // keep in sync and no way for a flag and the hours to disagree.
  const isAlwaysOpen =
    displayHours != null &&
    DAY_KEYS.every((d) => {
      const h = displayHours[d];
      return h?.open === "00:00" && h?.close === "23:59";
    });

  function setAlwaysOpen(on: boolean) {
    if (on) {
      const all = {} as BusinessHours;
      for (const d of DAY_KEYS) all[d] = { open: "00:00", close: "23:59" };
      setHours(all);
    } else {
      const weekdays = {} as BusinessHours;
      for (const d of DAY_KEYS) {
        weekdays[d] = d === "sat" || d === "sun" ? null : { open: "09:00", close: "17:00" };
      }
      setHours(weekdays);
    }
  }

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

  // Shown, not edited: the panel should answer "what will callers hear" without
  // making that a second place to change it.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch("/api/dashboard/branding", { cache: "no-store" });
        const b = (await res.json().catch(() => ({}))) as {
          branding?: { brandName?: string | null };
          profile?: { fullName?: string | null };
        };
        // Same order the server uses, so this shows what callers will hear
        // rather than a hopeful version of it.
        const name = b?.branding?.brandName?.trim() || b?.profile?.fullName?.trim() || "";
        if (!cancelled) setBrandName(name);

        // The brand profile the digital twin already built. Offered as a
        // starting draft rather than written in: the receptionist knowledge
        // box is free text an agent may have spent time on, and silently
        // replacing it would be the wrong kind of helpful.
        const tw = await fetch("/api/dashboard/digital-twin", { cache: "no-store" })
          .then((r) => r.json())
          .catch(() => null);
        const bp = tw?.profile as
          | { bio?: string; specialties?: string[]; market?: string; tagline?: string }
          | null
          | undefined;
        if (!cancelled && bp) {
          const parts = [
            bp.bio?.trim(),
            bp.market?.trim() ? `Market: ${bp.market.trim()}` : "",
            bp.specialties?.length ? `Specialties: ${bp.specialties.join(", ")}` : "",
            bp.tagline?.trim(),
          ].filter(Boolean);
          setBrandDraft(parts.join("\n\n"));
        }
      } catch {
        /* leave blank; the copy below explains where to set it */
      }
    })();
    return () => {
      cancelled = true;
    };
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
      <div className="text-sm text-slate-500 py-4" aria-busy="true">
        {t("pages.voiceReceptionistSettings.loading")}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-xs text-slate-600">{t("pages.voiceReceptionist.intro")}</p>

      <label className="flex items-center gap-2 text-sm text-slate-800">
        <input
          type="checkbox"
          checked={settings.enabled}
          onChange={(e) => update("enabled", e.target.checked)}
          className="h-4 w-4 rounded border-slate-300"
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
        <p className="mt-1 text-[11px] text-slate-400">{t("pages.voiceReceptionist.routingNote")}</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {/* Read-only, from branding. Typing it a second time here is what let
            an agent leave it blank and have the AI answer with their personal
            name instead of their business. */}
        <div>
          <span className={LABEL}>{t("pages.voiceSettings.businessName")}</span>
          <p className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">
            {brandName || t("pages.voiceSettings.businessNameUnset")}
          </p>
          <p className="mt-1 text-[11px] text-slate-500">{t("pages.voiceSettings.businessNameBrandNote")}</p>
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
        {/* Read-only. There is one timezone per account and it is set in one
            place; an editable copy here is what let the receptionist book on a
            different clock from everything else. Shown rather than hidden, because
            "when does the AI think 9am is" is a fair question to ask on this panel. */}
        <div>
          <span className={LABEL}>{t("pages.voiceSettings.timezone")}</span>
          <p className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">
            {settings.timezone}
          </p>
          <p className="mt-1 text-[11px] text-slate-500">{t("pages.voiceSettings.timezoneAccountNote")}</p>
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
        {brandDraft && settings.extraNotes.trim() !== brandDraft ? (
          <button
            type="button"
            onClick={() =>
              update(
                "extraNotes",
                settings.extraNotes.trim()
                  ? `${settings.extraNotes.trim()}\n\n${brandDraft}`
                  : brandDraft,
              )
            }
            className="mt-1 text-[11px] font-medium text-[#0072ce] underline hover:no-underline"
          >
            {settings.extraNotes.trim()
              ? t("pages.voiceSettings.kbAppendBrand")
              : t("pages.voiceSettings.kbFillFromBrand")}
          </button>
        ) : null}
      </div>

      <div>
        <span className={LABEL}>{t("pages.voiceSettings.officeHours")}</span>

        {/* 24/7 is expressed as every day 00:00-23:59 rather than a separate
            flag: the booking engine already reads these hours, so a flag would
            be a second thing it had to be taught about — and a second thing to
            forget. Unticking restores Mon-Fri 9-5 rather than leaving no hours
            at all, which would silently stop the AI booking anything. */}
        <label className="mb-2 flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
          <input
            type="checkbox"
            checked={isAlwaysOpen}
            onChange={(e) => setAlwaysOpen(e.target.checked)}
            className="h-4 w-4 rounded border-slate-300"
          />
          <span className="text-sm font-medium text-slate-800">{t("pages.voiceSettings.open247")}</span>
        </label>
        <p className="mb-2 text-[11px] text-slate-500">{t("pages.voiceSettings.open247Hint")}</p>

        <div className={`space-y-1.5 ${isAlwaysOpen ? "pointer-events-none opacity-50" : ""}`}>
          {DAY_KEYS.map((d) => {
            const dh = displayHours[d];
            const open = Boolean(dh);
            return (
              <div key={d} className="flex items-center gap-2 text-sm">
                <span className="w-24 shrink-0 text-slate-700">{DAY_LABELS[d]}</span>
                <label className="flex w-20 shrink-0 items-center gap-1.5 text-[11px] text-slate-500">
                  <input
                    type="checkbox"
                    checked={open}
                    onChange={(e) => setDay(d, e.target.checked ? dh ?? { open: "09:00", close: "17:00" } : null)}
                    className="h-3.5 w-3.5 rounded border-slate-300"
                  />
                  {open ? t("pages.voiceSettings.open") : t("pages.voiceSettings.closed")}
                </label>
                {open && dh ? (
                  <div className="flex items-center gap-1.5">
                    <input
                      type="time"
                      aria-label={`${DAY_LABELS[d]} opening time`}
                      className="rounded border border-slate-300 px-2 py-1 text-xs"
                      value={dh.open}
                      onChange={(e) => setDay(d, { open: e.target.value, close: dh.close })}
                    />
                    <span className="text-slate-400">–</span>
                    <input
                      type="time"
                      aria-label={`${DAY_LABELS[d]} closing time`}
                      className="rounded border border-slate-300 px-2 py-1 text-xs"
                      value={dh.close}
                      onChange={(e) => setDay(d, { open: dh.open, close: e.target.value })}
                    />
                  </div>
                ) : (
                  <span className="text-[11px] text-slate-400">—</span>
                )}
              </div>
            );
          })}
        </div>
        <p className="mt-1 text-[11px] text-slate-400">{t("pages.voiceReceptionist.hoursHint")}</p>
      </div>

      <div>
        <span className={LABEL}>{t("pages.voiceSettings.outOfMinutes")}</span>
        <div className="space-y-1.5">
          <label className="flex items-start gap-2 text-sm text-slate-800">
            <input
              type="radio"
              name="voiceLimitBehavior"
              checked={settings.voiceLimitBehavior === "text_back"}
              onChange={() => update("voiceLimitBehavior", "text_back")}
              className="mt-0.5 h-4 w-4 border-slate-300"
            />
            <span>{t("pages.dashFragments.textCallersBack")}{" "}
              <span className="text-[11px] text-slate-400">
                — the AI stops answering live and sends an SMS instead (no extra charge)
              </span>
            </span>
          </label>
          <label className="flex items-start gap-2 text-sm text-slate-800">
            <input
              type="radio"
              name="voiceLimitBehavior"
              checked={settings.voiceLimitBehavior === "overage"}
              onChange={() => update("voiceLimitBehavior", "overage")}
              className="mt-0.5 h-4 w-4 border-slate-300"
            />
            <span>{t("pages.dashFragments.keepAiAnswering")}{" "}
              <span className="text-[11px] text-slate-400">
                — additional minutes billed at $0.25/min
              </span>
            </span>
          </label>
        </div>
        <p className="mt-1 text-[11px] text-slate-400">{t("pages.dashFragments.needMoreMinutes")}{" "}
          <a href="/agent/pricing" className="text-brand-accent-text underline underline-offset-2">
            {t("pages.voiceReceptionistSettings.upgradePlan")}
          </a>
        </p>
      </div>

      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => void save()}
          disabled={!isDirty || saving}
          className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white transition-opacity disabled:opacity-50"
        >
          {saving ? t("pages.voiceSettings.saving") : t("pages.voiceSettings.save")}
        </button>
        {message && <span className="text-xs font-medium text-green-600">{message}</span>}
        {error && <span className="text-xs font-medium text-red-600">{error}</span>}
      </div>
    </div>
  );
}
