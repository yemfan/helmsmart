"use client";

import { useCallback, useEffect, useState } from "react";

/**
 * Weekly Social Schedule (MarketingBoss). Check the days you want a post; per
 * checked day set a time, channels, and a topic. AI researches the topic and
 * publishes on schedule. Text posts → Facebook / Threads / LinkedIn (image/video
 * platforms come later).
 */

type Platform = "facebook" | "threads" | "linkedin";

type Day = {
  weekday: number;
  enabled: boolean;
  postHour: number;
  postMinute: number;
  timezone: string;
  channels: Platform[] | null;
  topic: string;
};

const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const PLATFORMS: { id: Platform; label: string }[] = [
  { id: "facebook", label: "Facebook" },
  { id: "threads", label: "Threads" },
  { id: "linkedin", label: "LinkedIn" },
];
const ALL: Platform[] = ["facebook", "threads", "linkedin"];

const hhmm = (h: number, m: number) => `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;

export default function WeeklySchedule() {
  const [days, setDays] = useState<Day[] | null>(null);
  const [presets, setPresets] = useState<string[]>([]);
  const [configured, setConfigured] = useState(true);
  const [saving, setSaving] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/weekly-schedule");
      const b = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        days?: Day[];
        topicPresets?: string[];
        configured?: boolean;
      };
      if (!b.ok || !b.days) return;
      const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || "America/Los_Angeles";
      setDays(b.days.map((d) => ({ ...d, timezone: d.timezone || tz })));
      setPresets(b.topicPresets ?? []);
      setConfigured(b.configured ?? true);
    } catch {
      /* best-effort */
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  function patch(weekday: number, next: Partial<Day>) {
    setDays((cur) => cur?.map((d) => (d.weekday === weekday ? { ...d, ...next } : d)) ?? cur);
    setNote(null);
  }

  function togglePlatform(day: Day, p: Platform) {
    const cur = day.channels ?? ALL;
    const set = new Set(cur);
    if (set.has(p)) set.delete(p);
    else set.add(p);
    const arr = ALL.filter((x) => set.has(x));
    patch(day.weekday, { channels: arr.length === 0 || arr.length === ALL.length ? null : arr });
  }

  async function save() {
    if (!days) return;
    setSaving(true);
    setError(null);
    setNote(null);
    try {
      const res = await fetch("/api/weekly-schedule", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ days }),
      });
      const b = (await res.json().catch(() => ({}))) as { ok?: boolean; days?: Day[]; error?: string };
      if (!res.ok || !b.ok) {
        setError(b.error ?? "Couldn't save.");
        return;
      }
      if (b.days) {
        const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || "America/Los_Angeles";
        setDays(b.days.map((d) => ({ ...d, timezone: d.timezone || tz })));
      }
      setNote("Schedule saved.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Network error.");
    } finally {
      setSaving(false);
    }
  }

  if (!days) return <div className="py-4 text-sm text-neutral-500">Loading your weekly schedule…</div>;

  return (
    <div className="space-y-3">
      <div>
        <h2 className="text-base font-semibold text-neutral-900">Weekly post schedule</h2>
        <p className="mt-0.5 text-xs text-neutral-500">
          Pick the days you want a post. For each, set a time, channels, and a topic — AI researches the topic and posts
          automatically. Text posts go to Facebook, Threads, and LinkedIn.
        </p>
      </div>

      {!configured ? (
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[12px] text-amber-800">
          Not enabled yet (needs <code>ANTHROPIC_API_KEY</code>).
        </p>
      ) : null}

      <ul className="space-y-2">
        {days.map((d) => {
          const selected = d.channels ?? ALL;
          return (
            <li key={d.weekday} className="rounded-xl border border-neutral-200 bg-white p-3">
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={d.enabled}
                  onChange={(e) => patch(d.weekday, { enabled: e.target.checked })}
                />
                <span className="text-sm font-semibold text-neutral-900">{WEEKDAYS[d.weekday]}</span>
              </label>

              {d.enabled ? (
                <div className="mt-3 space-y-2">
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] font-medium text-neutral-500">Time</span>
                    <input
                      type="time"
                      value={hhmm(d.postHour, d.postMinute)}
                      onChange={(e) => {
                        const [h, m] = e.target.value.split(":").map((n) => parseInt(n, 10));
                        patch(d.weekday, { postHour: h || 0, postMinute: m || 0 });
                      }}
                      className="rounded-lg border border-neutral-300 px-2 py-1 text-sm"
                    />
                    <span className="text-[10px] text-neutral-400">{d.timezone}</span>
                  </div>

                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="text-[11px] font-medium text-neutral-500">Channels</span>
                    {PLATFORMS.map((p) => (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => togglePlatform(d, p.id)}
                        className={`rounded-full border px-2.5 py-0.5 text-[11px] font-medium ${
                          selected.includes(p.id)
                            ? "border-indigo-400 bg-indigo-50 text-neutral-900"
                            : "border-neutral-200 text-neutral-500"
                        }`}
                      >
                        {p.label}
                      </button>
                    ))}
                    {d.channels === null ? <span className="text-[10px] text-neutral-400">all connected</span> : null}
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-[11px] font-medium text-neutral-500">Topic</span>
                    <select
                      value={presets.includes(d.topic) ? d.topic : ""}
                      onChange={(e) => e.target.value && patch(d.weekday, { topic: e.target.value })}
                      className="rounded-lg border border-neutral-300 bg-white px-2 py-1 text-sm"
                    >
                      <option value="">Pick a topic…</option>
                      {presets.map((t) => (
                        <option key={t} value={t}>
                          {t}
                        </option>
                      ))}
                    </select>
                    <input
                      type="text"
                      value={d.topic}
                      onChange={(e) => patch(d.weekday, { topic: e.target.value })}
                      placeholder="…or type your own"
                      className="min-w-[180px] flex-1 rounded-lg border border-neutral-300 px-2 py-1 text-sm"
                    />
                  </div>
                </div>
              ) : null}
            </li>
          );
        })}
      </ul>

      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => void save()}
          disabled={saving}
          className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
        >
          {saving ? "Saving…" : "Save schedule"}
        </button>
        {note ? <span className="text-sm text-green-700">{note}</span> : null}
        {error ? <span className="text-sm text-red-600">{error}</span> : null}
      </div>
    </div>
  );
}
