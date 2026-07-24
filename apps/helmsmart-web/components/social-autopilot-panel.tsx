"use client";

import { useCallback, useEffect, useState } from "react";

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

const TONES = ["professional", "casual", "witty", "promotional", "educational"];

const DAYS = [
  { value: 1, label: "Mon" },
  { value: 2, label: "Tue" },
  { value: 3, label: "Wed" },
  { value: 4, label: "Thu" },
  { value: 5, label: "Fri" },
  { value: 6, label: "Sat" },
  { value: 0, label: "Sun" },
];

function utcHourToLocal(utcHour: number): number {
  const off = new Date().getTimezoneOffset() / 60;
  return (((utcHour - off) % 24) + 24) % 24;
}
function localHourToUtc(localHour: number): number {
  const off = new Date().getTimezoneOffset() / 60;
  return (((localHour + off) % 24) + 24) % 24;
}
function formatHour(h: number): string {
  const s = h < 12 ? "am" : "pm";
  const d = h % 12 === 0 ? 12 : h % 12;
  return `${d}${s}`;
}

export function SocialAutopilotPanel() {
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
        setError("Couldn't load autopilot settings.");
      }
    })();
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
        setError("Couldn't save that. Try again.");
      } finally {
        setSaving(false);
      }
    },
    [settings],
  );

  if (!settings) {
    return (
      <div className="mx-4 mt-3 rounded-lg border border-slate-200 bg-white px-4 py-3 text-sm text-slate-500">
        {error ?? "Loading autopilot…"}
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
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between px-4 py-3 text-left"
      >
        <div>
          <span className="text-sm font-semibold text-slate-900">Social autopilot</span>
          <span className="ml-2 text-xs text-slate-500">
            {s.enabled ? "On — writing & scheduling posts for you" : "Off"}
          </span>
        </div>
        <span
          className={`inline-flex h-5 w-9 items-center rounded-full transition ${s.enabled ? "bg-emerald-500" : "bg-slate-300"}`}
          role="switch"
          aria-checked={s.enabled}
          onClick={(e) => {
            e.stopPropagation();
            void save({ enabled: !s.enabled });
          }}
        >
          <span
            className={`h-4 w-4 rounded-full bg-white transition ${s.enabled ? "translate-x-4" : "translate-x-0.5"}`}
          />
        </span>
      </button>

      {open && (
        <div className={`space-y-5 border-t border-slate-100 px-4 py-4 ${s.enabled ? "" : "opacity-60"}`}>
          {/* Mode */}
          <div>
            <p className="text-xs font-semibold text-slate-700">Who approves posts</p>
            <div className="mt-1.5 grid gap-2 sm:grid-cols-2">
              {(
                [
                  { v: "review", label: "I review first", blurb: "Generated as drafts for you to schedule." },
                  { v: "auto", label: "Full autopilot", blurb: "Scheduled and published automatically." },
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
              Where to post{" "}
              <span className="font-normal text-slate-400">
                {s.platforms === null ? "(all connected)" : ""}
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
              Instagram isn&apos;t available for autopilot — it requires an image on every post.
            </p>
          </div>

          {/* Cadence */}
          <div className="grid gap-3 sm:grid-cols-3">
            <label className="block text-xs">
              <span className="font-semibold text-slate-700">Posts / week</span>
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
              <span className="font-semibold text-slate-700">Max / day</span>
              <select
                value={s.postsPerDay ?? ""}
                disabled={saving}
                onChange={(e) => save({ postsPerDay: e.target.value === "" ? null : Number(e.target.value) })}
                className="mt-1 w-full rounded-md border border-slate-300 px-2 py-1.5"
              >
                <option value="">1 (spread)</option>
                {[1, 2, 3, 4, 5].map((n) => (
                  <option key={n} value={n}>{n}</option>
                ))}
              </select>
            </label>
            <label className="block text-xs">
              <span className="font-semibold text-slate-700">Voice</span>
              <select
                value={s.tone}
                disabled={saving}
                onChange={(e) => save({ tone: e.target.value })}
                className="mt-1 w-full rounded-md border border-slate-300 px-2 py-1.5 capitalize"
              >
                {TONES.map((t) => (
                  <option key={t} value={t} className="capitalize">{t}</option>
                ))}
              </select>
            </label>
          </div>

          {/* Per-day schedule: pick days, give each a topic. */}
          <div>
            <p className="text-xs font-semibold text-slate-700">Posting schedule</p>
            <p className="mt-0.5 text-[11px] text-slate-500">
              Tick the days to post and choose a topic for each — pick one or type your own.
            </p>
            <datalist id="autopilot-topics">
              {PREDEFINED_TOPICS.map((t) => (
                <option key={t} value={t} />
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
                      {d.label}
                    </label>
                    <input
                      list="autopilot-topics"
                      value={s.dayTopics[key] ?? ""}
                      disabled={saving || !checked}
                      placeholder={checked ? "Topic (or type your own)" : "—"}
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
              When no days are ticked, posting falls back to {s.postsPerWeek}× a week spread
              automatically.
            </p>

            <label className="mt-2 block max-w-[220px] text-xs">
              <span className="font-semibold text-slate-700">Time of day</span>
              <select
                value={s.postHourUtc === null ? "" : utcHourToLocal(s.postHourUtc)}
                disabled={saving}
                onChange={(e) =>
                  save({ postHourUtc: e.target.value === "" ? null : localHourToUtc(Number(e.target.value)) })
                }
                className="mt-1 w-full rounded-md border border-slate-300 px-2 py-1.5"
              >
                <option value="">Default (noon ET)</option>
                {Array.from({ length: 24 }, (_, h) => (
                  <option key={h} value={h}>{formatHour(h)} your time</option>
                ))}
              </select>
              <span className="mt-0.5 block text-[11px] text-slate-400">
                Applies in full autopilot mode.
              </span>
            </label>
          </div>

          {error && <p className="text-xs text-red-600">{error}</p>}
        </div>
      )}
    </div>
  );
}
