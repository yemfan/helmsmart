"use client";

import { useState, useTransition } from "react";
import { BellRing, Loader2, Save } from "lucide-react";
import { Trans, useTranslation } from "react-i18next";
import { intlLocale } from "@leadsmart/i18n";
import { saveReminderSettings } from "@/lib/actions/outbound";
import { Toggle } from "@/components/ui/toggle";

type Reminder = { key: string; name: string; phone: string | null; startAt: string; reminderAt: string; status: string };

const STATUS_CLASSES: Record<string, string> = {
  pending: "bg-slate-100 text-slate-600",
  queued: "bg-amber-50 text-amber-700",
  calling: "bg-amber-50 text-amber-700",
  done: "bg-emerald-50 text-emerald-700",
  failed: "bg-red-50 text-red-700",
};

export function AppointmentReminders({
  enabled,
  leadMinutes,
  reminders,
  hasNumber,
}: {
  enabled: boolean;
  leadMinutes: number;
  reminders: Reminder[];
  hasNumber: boolean;
}) {
  const { t, i18n } = useTranslation("tasks");
  const initUnit: "hours" | "days" = leadMinutes % 1440 === 0 ? "days" : "hours";
  const initValue = initUnit === "days" ? leadMinutes / 1440 : Math.round(leadMinutes / 60);
  const [isOn, setIsOn] = useState(enabled);
  const [value, setValue] = useState(initValue || 1);
  const [unit, setUnit] = useState<"hours" | "days">(initUnit);
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [toggleError, setToggleError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const [toggling, startToggle] = useTransition();

  const fmt = (iso: string) =>
    new Date(iso).toLocaleString(intlLocale(i18n.language), { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });

  // The switch saves itself. It used to change only local state until the
  // separate Save button was pressed, so "on" on screen was not "on" anywhere.
  // A refused write puts it back and says why.
  function toggle(next: boolean) {
    setIsOn(next);
    setToggleError(null);
    startToggle(async () => {
      try {
        const res = await saveReminderSettings({ enabled: next });
        if (!res.ok) {
          setIsOn(!next);
          setToggleError(res.error ?? t("common:errors.generic"));
        }
      } catch (e) {
        console.error("switching appointment reminders", e);
        setIsOn(!next);
        setToggleError(t("common:errors.generic"));
      }
    });
  }

  // Save writes the lead time only — never the switch.
  function save() {
    const mins = unit === "days" ? value * 1440 : value * 60;
    setSaveError(null);
    start(async () => {
      try {
        const res = await saveReminderSettings({ leadMinutes: mins });
        if (!res.ok) { setSaveError(res.error ?? t("common:errors.generic")); return; }
        setSaved(true);
        setTimeout(() => setSaved(false), 2500);
      } catch (e) {
        console.error("saving the reminder lead time", e);
        setSaveError(t("common:errors.generic"));
      }
    });
  }

  return (
    <div className="bg-white rounded-xl border border-slate-200">
      <div className="px-6 py-4 border-b border-slate-100 flex items-start gap-2">
        <BellRing className="w-4 h-4 text-indigo-500 mt-0.5" />
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-semibold text-slate-700">{t("reminders.title")}</h2>
            <Toggle checked={isOn} onChange={toggle} disabled={toggling} label={t("reminders.title")} />
          </div>
          <p className="text-xs text-slate-400">{t("reminders.subtitle")}</p>
          {toggleError && <p className="mt-1 text-xs text-rose-600" role="alert">{toggleError}</p>}
        </div>
      </div>

      <div className="p-6 space-y-4">
        {/* Lead-time setting */}
        <div className="flex flex-wrap items-center gap-2 text-sm text-slate-600">
          <span>{t("reminders.leadBefore")}</span>
          <input
            type="number"
            min={1}
            value={value}
            onChange={(e) => setValue(Math.max(1, parseInt(e.target.value) || 1))}
            className="w-16 border border-slate-200 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
          <select
            value={unit}
            onChange={(e) => setUnit(e.target.value as "hours" | "days")}
            className="border border-slate-200 rounded-lg px-2 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
          >
            <option value="hours">{t("reminders.unitHours")}</option>
            <option value="days">{t("reminders.unitDays")}</option>
          </select>
          <span>{t("reminders.leadAfter")}</span>
          <button
            onClick={save}
            disabled={pending}
            className="ml-auto flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-xs font-medium rounded-lg transition-colors"
          >
            {pending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
            {pending ? t("common:status.saving") : saved ? t("reminders.saved") : t("reminders.save")}
          </button>
        </div>
        {saveError && <p className="text-xs text-rose-600 text-right" role="alert">{saveError}</p>}

        {!hasNumber && (
          <div className="rounded-lg bg-amber-50 border border-amber-100 px-3 py-2 text-xs text-amber-700">
            <Trans
              t={t}
              i18nKey="reminders.noNumber"
              components={{ link: <a href="/settings#voice-agent" className="underline" /> }}
            />
          </div>
        )}

        {/* Scheduled reminders */}
        <div>
          <p className="text-xs font-medium text-slate-500 mb-2">{t("reminders.upcoming")}</p>
          {reminders.length === 0 ? (
            <div className="rounded-lg border border-dashed border-slate-200 p-6 text-center text-sm text-slate-400">
              {t("reminders.empty")}
            </div>
          ) : (
            <div className="divide-y divide-slate-50 border border-slate-100 rounded-lg overflow-hidden">
              {reminders.map((r) => {
                const statusKey = r.status in STATUS_CLASSES ? r.status : "pending";
                return (
                  <div key={r.key} className="flex items-center gap-3 px-4 py-3">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-slate-800 truncate">{r.name || t("reminders.unnamed")}</p>
                      <p className="text-xs text-slate-400 truncate">
                        {t("reminders.when", { start: fmt(r.startAt), reminder: fmt(r.reminderAt) })}
                      </p>
                    </div>
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium shrink-0 ${STATUS_CLASSES[statusKey]}`}>
                      {t(`reminders.status.${statusKey}`)}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
          {!isOn && (
            <p className="text-[11px] text-slate-400 mt-2">
              {t("reminders.off")}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
