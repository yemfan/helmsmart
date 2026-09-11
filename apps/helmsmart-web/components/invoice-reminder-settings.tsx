"use client";

import { useState, useTransition } from "react";
import { CheckCircle2, AlertCircle, Bell, BellOff } from "lucide-react";
import { useTranslation } from "react-i18next";

// A "use server" action: importing it here gives the client a reference to call.
import { saveReminderSettings } from "@/lib/actions/invoice-reminder-settings";

interface Props {
  orgId: string;
  autoSend: boolean;
  daysIntervals: number[];
  maxCount: number;
}

/** `key` names the label in the bundle; `value` is the schedule itself. */
const PRESET_SCHEDULES = [
  { key: "gentle", value: [7, 21] },
  { key: "standard", value: [3, 7, 14, 30] },
  { key: "aggressive", value: [1, 3, 7, 14, 21, 30] },
] as const;

export function InvoiceReminderSettings({ orgId, autoSend, daysIntervals, maxCount }: Props) {
  const { t } = useTranslation("settings");
  const [enabled, setEnabled]     = useState(autoSend);
  const [intervals, setIntervals] = useState(daysIntervals.join(", "));
  const [max, setMax]             = useState(String(maxCount));
  const [saved, setSaved]         = useState(false);
  const [error, setError]         = useState<string | null>(null);
  const [isPending, start]        = useTransition();

  const handleSave = () => {
    const parsed = intervals
      .split(",")
      .map((s) => parseInt(s.trim(), 10))
      .filter((n) => !isNaN(n) && n > 0)
      .sort((a, b) => a - b);

    if (parsed.length === 0) {
      setError(t("financial.reminders.errors.noDays"));
      return;
    }

    setError(null);
    start(async () => {
      const result = await saveReminderSettings({
        autoSend: enabled,
        daysIntervals: parsed,
        maxCount: Math.max(1, parseInt(max, 10) || 4),
      });
      if (!result.ok) {
        setError(result.error ?? t("financial.reminders.errors.saveFailed"));
      } else {
        setSaved(true);
        setTimeout(() => setSaved(false), 2000);
      }
    });
  };

  return (
    <div className="bg-white rounded-xl border border-slate-200 p-6 space-y-5">
      <div className="flex items-center gap-3">
        {enabled
          ? <Bell className="w-5 h-5 text-indigo-600 flex-shrink-0" />
          : <BellOff className="w-5 h-5 text-slate-400 flex-shrink-0" />}
        <div className="flex-1">
          <h3 className="text-sm font-semibold text-slate-900">{t("financial.reminders.title")}</h3>
          <p className="text-xs text-slate-500 mt-0.5">{t("financial.reminders.description")}</p>
        </div>
        <div
          onClick={() => setEnabled((v) => !v)}
          className={`relative w-10 h-5 rounded-full transition-colors cursor-pointer ${enabled ? "bg-indigo-600" : "bg-slate-200"}`}
        >
          <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${enabled ? "translate-x-5" : "translate-x-0.5"}`} />
        </div>
      </div>

      {enabled && (
        <>
          {/* Preset schedules */}
          <div>
            <p className="text-xs font-medium text-slate-600 mb-2">{t("financial.reminders.presetsLabel")}</p>
            <div className="flex gap-2 flex-wrap">
              {PRESET_SCHEDULES.map((p) => (
                <button
                  key={p.key}
                  type="button"
                  onClick={() => setIntervals(p.value.join(", "))}
                  disabled={isPending}
                  className="text-xs px-3 py-1.5 border border-slate-200 rounded-full text-slate-600 hover:bg-slate-50 hover:border-indigo-200 transition-colors disabled:opacity-50"
                >
                  {t(`financial.reminders.presets.${p.key}`)}
                </button>
              ))}
            </div>
          </div>

          {/* Custom intervals */}
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1.5">
              {t("financial.reminders.intervalsLabel")}
            </label>
            <input
              type="text"
              value={intervals}
              onChange={(e) => setIntervals(e.target.value)}
              disabled={isPending}
              placeholder="3, 7, 14, 30"
              className="w-full text-sm border border-slate-300 rounded-lg px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:opacity-60 font-mono"
            />
            <p className="text-xs text-slate-400 mt-1">{t("financial.reminders.intervalsHelp")}</p>
          </div>

          {/* Max reminders */}
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1.5">
              {t("financial.reminders.maxLabel")}
            </label>
            <input
              type="number"
              value={max}
              onChange={(e) => setMax(e.target.value)}
              disabled={isPending}
              min={1}
              max={10}
              className="w-24 text-sm border border-slate-300 rounded-lg px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:opacity-60"
            />
          </div>
        </>
      )}

      {error && (
        <div className="flex items-center gap-2 text-sm text-rose-600 bg-rose-50 border border-rose-200 rounded-lg p-3">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          {error}
        </div>
      )}

      <div className="flex items-center gap-3">
        <button
          onClick={handleSave}
          disabled={isPending}
          className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50"
        >
          {isPending ? t("actions.saving") : saved ? t("actions.saved") : t("financial.reminders.save")}
        </button>
        {saved && (
          <div className="flex items-center gap-1.5 text-sm text-emerald-600">
            <CheckCircle2 className="w-4 h-4" />
            {t("financial.reminders.savedNote")}
          </div>
        )}
      </div>
    </div>
  );
}
