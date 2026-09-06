"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import type { AgentMessageSettings } from "@/lib/agent-messaging/types";

type State = Pick<
  AgentMessageSettings,
  | "quietHoursStart"
  | "quietHoursEnd"
  | "useContactTimezone"
  | "noSundayMorning"
  | "pauseChineseNewYear"
  | "maxPerContactPerDay"
  | "pauseOnReplyDays"
>;

const DEFAULT_STATE: State = {
  quietHoursStart: "21:00",
  quietHoursEnd: "08:00",
  useContactTimezone: true,
  noSundayMorning: true,
  pauseChineseNewYear: true,
  maxPerContactPerDay: 2,
  pauseOnReplyDays: 7,
};

function same(a: State, b: State): boolean {
  return (
    a.quietHoursStart === b.quietHoursStart &&
    a.quietHoursEnd === b.quietHoursEnd &&
    a.useContactTimezone === b.useContactTimezone &&
    a.noSundayMorning === b.noSundayMorning &&
    a.pauseChineseNewYear === b.pauseChineseNewYear &&
    a.maxPerContactPerDay === b.maxPerContactPerDay &&
    a.pauseOnReplyDays === b.pauseOnReplyDays
  );
}

export default function TimingPanel() {
  const { t } = useTranslation("dashboard");
  const [state, setState] = useState<State>(DEFAULT_STATE);
  const [saved, setSaved] = useState<State>(DEFAULT_STATE);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const isDirty = !same(state, saved);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/dashboard/agent-message-settings");
      const data = (await res.json()) as {
        ok?: boolean;
        settings?: AgentMessageSettings;
        error?: string;
      };
      if (!res.ok || !data.ok || !data.settings) {
        throw new Error(data.error || "Failed to load");
      }
      const next: State = {
        quietHoursStart: data.settings.quietHoursStart,
        quietHoursEnd: data.settings.quietHoursEnd,
        useContactTimezone: data.settings.useContactTimezone,
        noSundayMorning: data.settings.noSundayMorning,
        pauseChineseNewYear: data.settings.pauseChineseNewYear,
        maxPerContactPerDay: data.settings.maxPerContactPerDay,
        pauseOnReplyDays: data.settings.pauseOnReplyDays,
      };
      setState(next);
      setSaved(next);
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
      const res = await fetch("/api/dashboard/agent-message-settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(state),
      });
      const data = (await res.json()) as {
        ok?: boolean;
        settings?: AgentMessageSettings;
        error?: string;
      };
      if (!res.ok || !data.ok || !data.settings) {
        throw new Error(data.error || "Save failed");
      }
      const next: State = {
        quietHoursStart: data.settings.quietHoursStart,
        quietHoursEnd: data.settings.quietHoursEnd,
        useContactTimezone: data.settings.useContactTimezone,
        noSundayMorning: data.settings.noSundayMorning,
        pauseChineseNewYear: data.settings.pauseChineseNewYear,
        maxPerContactPerDay: data.settings.maxPerContactPerDay,
        pauseOnReplyDays: data.settings.pauseOnReplyDays,
      };
      setState(next);
      setSaved(next);
      setMessage("Saved.");
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="text-sm text-slate-500" aria-busy="true">
        {t("pages.timingPanel.loading")}
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <Label>{t("pages.timingPanel.quietStart")}</Label>
          <Hint>{t("pages.timingPanel.quietStartHint")}</Hint>
          <input
            type="time"
            aria-label={t("pages.timingPanel.quietStart")}
            value={state.quietHoursStart}
            onChange={(e) => setState((s) => ({ ...s, quietHoursStart: e.target.value }))}
            className="mt-1 block w-full max-w-[8rem] rounded-lg border border-slate-300 px-3 py-2 text-sm"
          />
        </div>
        <div>
          <Label>{t("pages.timingPanel.quietEnd")}</Label>
          <Hint>{t("pages.timingPanel.quietEndHint")}</Hint>
          <input
            type="time"
            aria-label={t("pages.timingPanel.quietEnd")}
            value={state.quietHoursEnd}
            onChange={(e) => setState((s) => ({ ...s, quietHoursEnd: e.target.value }))}
            className="mt-1 block w-full max-w-[8rem] rounded-lg border border-slate-300 px-3 py-2 text-sm"
          />
        </div>
      </div>

      <div className="space-y-3 border-t border-slate-100 pt-4">
        <CheckboxRow
          checked={state.useContactTimezone}
          onChange={(v) => setState((s) => ({ ...s, useContactTimezone: v }))}
          label={t("pages.timingPanel.useContactTz")}
          hint={t("pages.timingPanel.useContactTzHint")}
        />
        <CheckboxRow
          checked={state.noSundayMorning}
          onChange={(v) => setState((s) => ({ ...s, noSundayMorning: v }))}
          label={t("pages.timingPanel.noSundayMorning")}
          hint={t("pages.timingPanel.noSundayMorningHint")}
        />
        <CheckboxRow
          checked={state.pauseChineseNewYear}
          onChange={(v) => setState((s) => ({ ...s, pauseChineseNewYear: v }))}
          label={t("pages.timingPanel.pauseCny")}
          hint={t("pages.timingPanel.pauseCnyHint")}
        />
      </div>

      <div className="grid grid-cols-1 gap-4 border-t border-slate-100 pt-4 sm:grid-cols-2">
        <div>
          <Label>{t("pages.timingPanel.maxPerDay")}</Label>
          <Hint>{t("pages.timingPanel.maxPerDayHint")}</Hint>
          <Stepper
            value={state.maxPerContactPerDay}
            onChange={(v) => setState((s) => ({ ...s, maxPerContactPerDay: v }))}
            min={1}
            max={5}
          />
        </div>
        <div>
          <Label>{t("pages.timingPanel.pauseOnReply")}</Label>
          <Hint>{t("pages.timingPanel.pauseOnReplyHint")}</Hint>
          <Stepper
            value={state.pauseOnReplyDays}
            onChange={(v) => setState((s) => ({ ...s, pauseOnReplyDays: v }))}
            min={0}
            max={30}
          />
        </div>
      </div>

      <div className="flex items-center gap-3 border-t border-slate-100 pt-4">
        <button
          type="button"
          onClick={() => void save()}
          disabled={saving || !isDirty}
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

function Label({ children }: { children: React.ReactNode }) {
  return <div className="text-[11px] font-medium text-slate-500">{children}</div>;
}
function Hint({ children }: { children: React.ReactNode }) {
  return <div className="text-[11px] text-slate-400 mb-1.5">{children}</div>;
}

function CheckboxRow({
  checked,
  onChange,
  label,
  hint,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  hint: string;
}) {
  return (
    <label className="flex cursor-pointer items-start gap-3">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-0.5 h-4 w-4 accent-brand-accent"
      />
      <span>
        <span className="block text-sm font-medium text-slate-900">{label}</span>
        <span className="block text-xs text-slate-500">{hint}</span>
      </span>
    </label>
  );
}

function Stepper({
  value,
  onChange,
  min,
  max,
}: {
  value: number;
  onChange: (v: number) => void;
  min: number;
  max: number;
}) {
  const { t } = useTranslation("dashboard");
  return (
    <div className="mt-1 inline-flex items-center rounded-lg border border-slate-300 bg-white">
      <button
        type="button"
        onClick={() => onChange(Math.max(min, value - 1))}
        disabled={value <= min}
        aria-label={t("pages.labels.decrement")}
        className="px-3 py-2 text-slate-600 disabled:opacity-30"
      >
        −
      </button>
      <div className="min-w-[2ch] px-2 text-center text-sm font-semibold tabular-nums">{value}</div>
      <button
        type="button"
        onClick={() => onChange(Math.min(max, value + 1))}
        disabled={value >= max}
        aria-label={t("pages.labels.increment")}
        className="px-3 py-2 text-slate-600 disabled:opacity-30"
      >
        +
      </button>
    </div>
  );
}
