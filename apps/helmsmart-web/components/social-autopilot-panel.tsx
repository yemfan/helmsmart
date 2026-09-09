"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useTranslation } from "react-i18next";
import { Toggle } from "@/components/ui/toggle";

/**
 * Social autopilot controls for HelmSmart: turn it on, and Emily writes and
 * schedules posts about the business on the chosen cadence. Every which/when
 * field has an explicit "no preference" state that maps to the engine default,
 * so an untouched org keeps today's behaviour (nothing auto-posts).
 *
 * Instagram is intentionally absent from the platform list: these are text-only
 * posts and IG's API needs an image, so autopilot can't target it.
 */

type Settings = {
  enabled: boolean;
  mode: "review" | "auto";
  postsPerWeek: number;
  postsPerDay: number | null;
  platforms: string[] | null;
  postDays: number[] | null;
  postHourUtc: number | null;
  tone: string;
  dayTopics: Record<string, string>;
};

const PREDEFINED_TOPICS = ["service", "product", "customers", "economy", "local market"];
const DEFAULT_DAY_TOPIC = "service";

const PLATFORM_LABELS: Record<string, string> = {
  facebook: "Facebook",
  linkedin: "LinkedIn",
  threads: "Threads",
};

// Stored tone vocabulary; labels come from `social.autopilot.tones.<tone>`.
const TONES = ["professional", "casual", "witty", "promotional", "educational"];

// `value` is the JS day-of-week the engine stores; the label key names the
// weekday in `social.autopilot.days.<key>`.
const DAYS = [
  { value: 1, key: "mon" },
  { value: 2, key: "tue" },
  { value: 3, key: "wed" },
  { value: 4, key: "thu" },
  { value: 5, key: "fri" },
  { value: 6, key: "sat" },
  { value: 0, key: "sun" },
] as const;

function utcHourToLocal(utcHour: number): number {
  const off = new Date().getTimezoneOffset() / 60;
  return (((utcHour - off) % 24) + 24) % 24;
}
function localHourToUtc(localHour: number): number {
  const off = new Date().getTimezoneOffset() / 60;
  return (((localHour + off) % 24) + 24) % 24;
}
/** 13 → { hour: 1, isPm: true }; the words come from the bundle. */
function hourParts(h: number): { hour: number; isPm: boolean } {
  return { hour: h % 12 === 0 ? 12 : h % 12, isPm: h >= 12 };
}

export function SocialAutopilotPanel({
  variant = "bar",
}: {
  /** "bar" (on /social): toggle + status + a Settings link. "full" (in
   *  Settings → Marketing): the toggle + the whole config form, always open. */
  variant?: "bar" | "full";
} = {}) {
  const { t } = useTranslation("marketing");
  const [settings, setSettings] = useState<Settings | null>(null);
  const [platformOptions, setPlatformOptions] = useState<string[]>([]);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/social/autopilot");
        const json = await res.json();
        if (!json.ok) throw new Error(json.error);
        setSettings(json.settings as Settings);
        setPlatformOptions(json.options?.platforms ?? []);
      } catch {
        setError(t("social.autopilot.loadError"));
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const save = useCallback(
    async (patch: Partial<Settings>) => {
      const prev = settings;
      setSettings((s) => (s ? { ...s, ...patch } : s));
      setSaving(true);
      setError(null);
      try {
        const res = await fetch("/api/social/autopilot", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(patch),
        });
        const json = await res.json();
        if (!res.ok || !json.ok) throw new Error(json.error);
        setSettings(json.settings as Settings);
      } catch {
        setSettings(prev);
        setError(t("social.autopilot.saveError"));
      } finally {
        setSaving(false);
      }
    },
    [settings, t],
  );

  if (!settings) {
    return (
      <div className="mx-4 mt-3 rounded-lg border border-slate-200 bg-white px-4 py-3 text-sm text-slate-500">
        {error ?? t("social.autopilot.loading")}
      </div>
    );
  }

  const s = settings;
  const toggleIn = (list: string[] | null, v: string): string[] | null => {
    const cur = list ?? [];
    const next = cur.includes(v) ? cur.filter((x) => x !== v) : [...cur, v];
    return next.length > 0 ? next : null;
  };

  return (
    <div className="mx-4 mt-3 rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="flex items-center justify-between px-4 py-3">
        {/* On/off sits right next to its label so the status is unmistakable. */}
        <div className="flex items-center gap-2.5">
          <Toggle
            checked={s.enabled}
            disabled={saving}
            onChange={(v) => void save({ enabled: v })}
            label={t("social.autopilot.label")}
          />
          <div className="leading-tight">
            <span className="text-sm font-semibold text-slate-900">{t("social.autopilot.label")}</span>
            <span className="ml-2 text-xs text-slate-500">
              {s.enabled ? t("social.autopilot.on") : t("social.autopilot.off")}
            </span>
          </div>
        </div>
        {/* On /social the settings live in one place — link to them, labelled.
            In Settings → Marketing the form is already shown below (no gear). */}
        {variant === "bar" && (
          <Link
            href="/settings?tab=marketing"
            title={t("social.autopilot.settingsTitle")}
            className="flex items-center gap-1.5 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-medium text-slate-600 transition hover:bg-slate-50 hover:text-slate-800"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-4 w-4">
              <circle cx="12" cy="12" r="3" />
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
            </svg>
            {t("social.autopilot.settings")}
          </Link>
        )}
      </div>

      {(variant === "full" || open) && (
        <div className={`space-y-5 border-t border-slate-100 px-4 py-4 ${s.enabled ? "" : "opacity-60"}`}>
          {/* Mode */}
          <div>
            <p className="text-xs font-semibold text-slate-700">{t("social.autopilot.modeTitle")}</p>
            <div className="mt-1.5 grid gap-2 sm:grid-cols-2">
              {(
                [
                  { v: "review", label: t("social.autopilot.modeReview"), blurb: t("social.autopilot.modeReviewBlurb") },
                  { v: "auto", label: t("social.autopilot.modeAuto"), blurb: t("social.autopilot.modeAutoBlurb") },
                ] as const
              ).map((o) => (
                <label
                  key={o.v}
                  className={`flex cursor-pointer flex-col rounded-lg border p-2.5 text-xs ${
                    s.mode === o.v ? "border-emerald-400 bg-emerald-50/50" : "border-slate-200"
                  }`}
                >
                  <span className="flex items-center gap-2 font-medium text-slate-900">
                    <input
                      type="radio"
                      checked={s.mode === o.v}
                      disabled={saving}
                      onChange={() => save({ mode: o.v })}
                    />
                    {o.label}
                  </span>
                  <span className="mt-0.5 text-slate-500">{o.blurb}</span>
                </label>
              ))}
            </div>
          </div>

          {/* Platforms */}
          <div>
            <p className="text-xs font-semibold text-slate-700">
              {t("social.autopilot.platformsTitle")}{" "}
              <span className="font-normal text-slate-400">
                {s.platforms === null ? t("social.autopilot.allConnected") : ""}
              </span>
            </p>
            <div className="mt-1.5 flex flex-wrap gap-2">
              {platformOptions.map((p) => {
                const on = s.platforms === null || s.platforms.includes(p);
                const explicit = s.platforms !== null && s.platforms.includes(p);
                return (
                  <button
                    key={p}
                    type="button"
                    disabled={saving}
                    onClick={() => save({ platforms: toggleIn(s.platforms, p) })}
                    className={`rounded-full border px-3 py-1 text-xs font-medium ${
                      explicit
                        ? "border-emerald-500 bg-emerald-500 text-white"
                        : on
                          ? "border-slate-300 text-slate-700"
                          : "border-slate-200 bg-slate-50 text-slate-400"
                    }`}
                  >
                    {PLATFORM_LABELS[p] ?? p}
                  </button>
                );
              })}
            </div>
            <p className="mt-1 text-[11px] text-slate-400">
              {t("social.autopilot.instagramNote")}
            </p>
          </div>

          {/* Cadence */}
          <div className="grid gap-3 sm:grid-cols-3">
            <label className="block text-xs">
              <span className="font-semibold text-slate-700">{t("social.autopilot.postsPerWeek")}</span>
              <select
                value={s.postsPerWeek}
                disabled={saving}
                onChange={(e) => save({ postsPerWeek: Number(e.target.value) })}
                className="mt-1 w-full rounded-md border border-slate-300 px-2 py-1.5"
              >
                {[1, 2, 3, 4, 5, 6, 7].map((n) => (
                  <option key={n} value={n}>{n}</option>
                ))}
              </select>
            </label>
            <label className="block text-xs">
              <span className="font-semibold text-slate-700">{t("social.autopilot.maxPerDay")}</span>
              <select
                value={s.postsPerDay ?? ""}
                disabled={saving}
                onChange={(e) => save({ postsPerDay: e.target.value === "" ? null : Number(e.target.value) })}
                className="mt-1 w-full rounded-md border border-slate-300 px-2 py-1.5"
              >
                <option value="">{t("social.autopilot.spread")}</option>
                {[1, 2, 3, 4, 5].map((n) => (
                  <option key={n} value={n}>{n}</option>
                ))}
              </select>
            </label>
            <label className="block text-xs">
              <span className="font-semibold text-slate-700">{t("social.autopilot.voice")}</span>
              <select
                value={s.tone}
                disabled={saving}
                onChange={(e) => save({ tone: e.target.value })}
                className="mt-1 w-full rounded-md border border-slate-300 px-2 py-1.5"
              >
                {TONES.map((tone) => (
                  <option key={tone} value={tone}>{t(`social.autopilot.tones.${tone}`)}</option>
                ))}
              </select>
            </label>
          </div>

          {/* Per-day schedule: pick days, give each a topic. */}
          <div>
            <p className="text-xs font-semibold text-slate-700">{t("social.autopilot.scheduleTitle")}</p>
            <p className="mt-0.5 text-[11px] text-slate-500">
              {t("social.autopilot.scheduleHint")}
            </p>
            <datalist id="autopilot-topics">
              {PREDEFINED_TOPICS.map((topic) => (
                <option key={topic} value={topic} />
              ))}
            </datalist>
            <div className="mt-2 space-y-1.5">
              {DAYS.map((d) => {
                const key = String(d.value);
                const checked = key in s.dayTopics;
                return (
                  <div key={d.value} className="flex items-center gap-2">
                    <label className="flex w-14 shrink-0 cursor-pointer items-center gap-1.5 text-xs font-medium text-slate-700">
                      <input
                        type="checkbox"
                        checked={checked}
                        disabled={saving}
                        onChange={() => {
                          const next = { ...s.dayTopics };
                          if (checked) delete next[key];
                          else next[key] = DEFAULT_DAY_TOPIC;
                          void save({ dayTopics: next });
                        }}
                      />
                      {t(`social.autopilot.days.${d.key}`)}
                    </label>
                    <input
                      list="autopilot-topics"
                      value={s.dayTopics[key] ?? ""}
                      disabled={saving || !checked}
                      placeholder={checked ? t("social.autopilot.topicPlaceholder") : t("social.autopilot.noTopic")}
                      onChange={(e) =>
                        setSettings((prev) =>
                          prev
                            ? { ...prev, dayTopics: { ...prev.dayTopics, [key]: e.target.value } }
                            : prev,
                        )
                      }
                      onBlur={() => {
                        // Persist on blur so we don't PUT on every keystroke; drop
                        // an emptied topic (server also sanitises).
                        const next = { ...s.dayTopics };
                        if (!(next[key] ?? "").trim()) delete next[key];
                        void save({ dayTopics: next });
                      }}
                      className="flex-1 rounded-md border border-slate-300 px-2 py-1 text-xs disabled:bg-slate-50 disabled:text-slate-400"
                    />
                  </div>
                );
              })}
            </div>
            <p className="mt-1.5 text-[11px] text-slate-400">
              {t("social.autopilot.fallback", { count: s.postsPerWeek })}
            </p>

            <label className="mt-2 block max-w-[220px] text-xs">
              <span className="font-semibold text-slate-700">{t("social.autopilot.timeOfDay")}</span>
              <select
                value={s.postHourUtc === null ? "" : utcHourToLocal(s.postHourUtc)}
                disabled={saving}
                onChange={(e) =>
                  save({ postHourUtc: e.target.value === "" ? null : localHourToUtc(Number(e.target.value)) })
                }
                className="mt-1 w-full rounded-md border border-slate-300 px-2 py-1.5"
              >
                <option value="">{t("social.autopilot.defaultTime")}</option>
                {Array.from({ length: 24 }, (_, h) => {
                  const { hour, isPm } = hourParts(h);
                  return (
                    <option key={h} value={h}>
                      {t("social.autopilot.hourOption", {
                        hour,
                        ampm: isPm ? t("social.autopilot.pm") : t("social.autopilot.am"),
                      })}
                    </option>
                  );
                })}
              </select>
              <span className="mt-0.5 block text-[11px] text-slate-400">
                {t("social.autopilot.appliesInAuto")}
              </span>
            </label>
          </div>

          {error && <p className="text-xs text-red-600" role="alert">{error}</p>}
        </div>
      )}
    </div>
  );
}
