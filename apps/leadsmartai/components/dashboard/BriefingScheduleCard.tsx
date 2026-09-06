"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { LoadingText } from "@/components/ui/LoadingText";

/**
 * Briefing schedule settings — controls when the morning + evening
 * briefings fire for this agent. Three fields:
 *   - briefing_morning_time (HH:MM, default 07:00)
 *   - briefing_evening_time (HH:MM, default 18:00)
 *
 * The cron is a single 15-min tick that branches off these per-
 * agent values, so editing here changes nothing about the cron
 * itself — it just shifts which 15-min window this particular
 * agent is matched to.
 *
 * Time inputs use the native <input type="time"> picker which gives
 * 24-hour HH:MM out of the box and is familiar across desktop and
 * mobile browsers.
 *
 * The timezone is deliberately NOT here. These times are read in the account's
 * timezone, but that value also decides when the overnight run starts, what
 * "tomorrow at 3" means to the receptionist and which slots a caller is
 * offered — so it belongs in Settings → General, not in a card named after one
 * of its consumers. Editing it here is how the column came to be called
 * briefing_timezone, and how two other features grew their own copy of it.
 */

type Settings = {
  briefing_morning_time: string;
  briefing_evening_time: string;
};

export default function BriefingScheduleCard() {
  const { t } = useTranslation("dashboard");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [settings, setSettings] = useState<Settings>({
    briefing_morning_time: "07:00",
    briefing_evening_time: "18:00",
  });

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
      const res = await fetch("/api/dashboard/briefing-settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          briefing_morning_time: settings.briefing_morning_time,
          briefing_evening_time: settings.briefing_evening_time,
        }),
      });
      const json = (await res.json()) as { ok: boolean; settings?: Settings; error?: string };
      if (!json.ok || !json.settings) {
        setError(json.error || "Save failed.");
        return;
      }
      setSettings(json.settings);
      setSavedAt(Date.now());
      setTimeout(() => setSavedAt(null), 3000);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }, [settings.briefing_evening_time, settings.briefing_morning_time]);

  if (loading) {
    return (
      <div className="space-y-2 text-xs text-slate-500"><LoadingText /></div>
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
            className="block w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
          <p className="mt-1 text-[11px] text-slate-500">
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
            className="block w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
          <p className="mt-1 text-[11px] text-slate-500">
            {t("pages.briefingSchedule.eveningBlurb")}
          </p>
        </Field>
      </div>

      {/*
        The timezone control moved to Settings → General.
        One value governs briefings, the overnight run, the receptionist and
        every booking; editing it under "Briefing schedule" hid it and implied
        it only governed briefings, which is how two other places grew their
        own copy of the same setting.
      */}
      <p className="text-[11px] text-slate-500">
        {t("pages.briefingSchedule.timezoneMoved")}
      </p>

      {error ? (
        <p className="text-xs text-rose-600">{error}</p>
      ) : null}

      {/* Confirmation on the button itself, per the repo convention — not a
          separate word appearing beside it. */}
      <div>
        <button
          type="button"
          onClick={() => void onSave()}
          disabled={saving}
          className="inline-flex items-center justify-center rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-blue-700 disabled:opacity-60"
        >
          {saving
            ? t("common:status.saving")
            : savedAt
              ? t("pages.briefingSchedule.saved")
              : t("pages.briefingSchedule.saveSchedule")}
        </button>
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
      <label className="mb-1 block text-xs font-medium text-slate-700">{label}</label>
      {children}
    </div>
  );
}
