"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { LoadingText } from "@/components/ui/LoadingText";

/**
 * Briefing schedule settings — controls when the morning + evening
 * briefings fire for this agent. Three fields:
 *   - briefing_morning_time (HH:MM, default 07:00)
 *   - briefing_evening_time (HH:MM, default 18:00)
 *   - briefing_timezone (IANA, default America/Los_Angeles)
 *
 * The cron is a single 15-min tick that branches off these per-
 * agent values, so editing here changes nothing about the cron
 * itself — it just shifts which 15-min window this particular
 * agent is matched to.
 *
 * Time inputs use the native <input type="time"> picker which gives
 * 24-hour HH:MM out of the box and is familiar across desktop and
 * mobile browsers. The timezone select is a curated short-list of
 * common North American + key international zones; agents can also
 * type any IANA name into the "Other timezone…" text field.
 */

type Settings = {
  briefing_morning_time: string;
  briefing_evening_time: string;
  briefing_timezone: string;
};

const COMMON_TZS: Array<{ value: string; label: string }> = [
  { value: "America/Los_Angeles", label: "Pacific (Los Angeles)" },
  { value: "America/Denver", label: "Mountain (Denver)" },
  { value: "America/Chicago", label: "Central (Chicago)" },
  { value: "America/New_York", label: "Eastern (New York)" },
  { value: "America/Phoenix", label: "Arizona (no DST)" },
  { value: "America/Anchorage", label: "Alaska" },
  { value: "Pacific/Honolulu", label: "Hawaii" },
  { value: "America/Toronto", label: "Toronto" },
  { value: "America/Vancouver", label: "Vancouver" },
  { value: "America/Mexico_City", label: "Mexico City" },
  { value: "Europe/London", label: "London" },
  { value: "Europe/Paris", label: "Paris" },
  { value: "Asia/Tokyo", label: "Tokyo" },
  { value: "Asia/Singapore", label: "Singapore" },
  { value: "Australia/Sydney", label: "Sydney" },
];

const COMMON_TZ_VALUES = new Set(COMMON_TZS.map((t) => t.value));
const OTHER = "__other__";

export default function BriefingScheduleCard() {
  const { t } = useTranslation("dashboard");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [settings, setSettings] = useState<Settings>({
    briefing_morning_time: "07:00",
    briefing_evening_time: "18:00",
    briefing_timezone: "America/Los_Angeles",
  });
  /** Local UI state for the "other timezone" text field. Distinct
   *  from `settings.briefing_timezone` so the user can pick "Other"
   *  in the dropdown and type before we commit. */
  const [otherTz, setOtherTz] = useState("");

  const tzMode = useMemo<"common" | "other">(
    () => (COMMON_TZ_VALUES.has(settings.briefing_timezone) ? "common" : "other"),
    [settings.briefing_timezone],
  );

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/dashboard/briefing-settings");
      const json = (await res.json()) as { ok: boolean; settings?: Settings; error?: string };
      if (!json.ok || !json.settings) {
        setError(json.error || "Could not load briefing settings.");
        return;
      }
      setSettings(json.settings);
      if (!COMMON_TZ_VALUES.has(json.settings.briefing_timezone)) {
        setOtherTz(json.settings.briefing_timezone);
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const onSave = useCallback(async () => {
    setSaving(true);
    setError(null);
    try {
      const tz =
        tzMode === "other"
          ? otherTz.trim() || settings.briefing_timezone
          : settings.briefing_timezone;
      const res = await fetch("/api/dashboard/briefing-settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          briefing_morning_time: settings.briefing_morning_time,
          briefing_evening_time: settings.briefing_evening_time,
          briefing_timezone: tz,
        }),
      });
      const json = (await res.json()) as { ok: boolean; settings?: Settings; error?: string };
      if (!json.ok || !json.settings) {
        setError(json.error || "Save failed.");
        return;
      }
      setSettings(json.settings);
      if (!COMMON_TZ_VALUES.has(json.settings.briefing_timezone)) {
        setOtherTz(json.settings.briefing_timezone);
      }
      setSavedAt(Date.now());
      setTimeout(() => setSavedAt(null), 3000);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }, [otherTz, settings.briefing_evening_time, settings.briefing_morning_time, settings.briefing_timezone, tzMode]);

  if (loading) {
    return (
      <div className="space-y-2 text-xs text-gray-500"><LoadingText /></div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={t("pages.briefingSchedule.morning")}>
          <input
            type="time"
            value={settings.briefing_morning_time}
            onChange={(e) =>
              setSettings((s) => ({ ...s, briefing_morning_time: e.target.value }))
            }
            className="block w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
          <p className="mt-1 text-[11px] text-gray-500">
            {t("pages.briefingSchedule.morningBlurb")}
          </p>
        </Field>
        <Field label={t("pages.briefingSchedule.evening")}>
          <input
            type="time"
            value={settings.briefing_evening_time}
            onChange={(e) =>
              setSettings((s) => ({ ...s, briefing_evening_time: e.target.value }))
            }
            className="block w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
          <p className="mt-1 text-[11px] text-gray-500">
            {t("pages.briefingSchedule.eveningBlurb")}
          </p>
        </Field>
      </div>

      <Field label={t("pages.briefingSchedule.timezone")}>
        <select
          value={tzMode === "other" ? OTHER : settings.briefing_timezone}
          onChange={(e) => {
            const v = e.target.value;
            if (v === OTHER) {
              setSettings((s) => ({
                ...s,
                briefing_timezone: otherTz || s.briefing_timezone,
              }));
            } else {
              setSettings((s) => ({ ...s, briefing_timezone: v }));
            }
          }}
          className="block w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
        >
          {COMMON_TZS.map((t) => (
            <option key={t.value} value={t.value}>
              {t.label}
            </option>
          ))}
          <option value={OTHER}>{t("pages.briefingSchedule.otherTimezone")}</option>
        </select>
        {tzMode === "other" ? (
          <input
            type="text"
            value={otherTz}
            placeholder={t("pages.briefingSchedule.tzPlaceholder")}
            onChange={(e) => {
              setOtherTz(e.target.value);
              setSettings((s) => ({ ...s, briefing_timezone: e.target.value }));
            }}
            className="mt-2 block w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
        ) : null}
        <p className="mt-1 text-[11px] text-gray-500">{t("pages.briefingSchedule.tzHint")}</p>
      </Field>

      {error ? (
        <p className="text-xs text-rose-600">{error}</p>
      ) : null}

      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => void onSave()}
          disabled={saving}
          className="inline-flex items-center justify-center rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-blue-700 disabled:opacity-60"
        >
          {saving ? t("common:status.saving") : t("pages.briefingSchedule.saveSchedule")}
        </button>
        {savedAt ? (
          <span className="text-xs font-medium text-emerald-700">{t("pages.briefingSchedule.saved")}</span>
        ) : null}
      </div>
    </div>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="mb-1 block text-xs font-medium text-gray-700">{label}</label>
      {children}
    </div>
  );
}
