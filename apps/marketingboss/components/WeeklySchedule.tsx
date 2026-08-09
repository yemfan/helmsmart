"use client";

import { useCallback, useEffect, useState } from "react";

/**
 * Weekly Social Schedule (MarketingBoss). Check the days you want a post; per
 * checked day pick a content type (text / image / video), a time, channels, and a
 * topic. AI researches the topic; image/video days also generate the media on
 * fal.ai (spends credits). Text → Facebook / Threads / LinkedIn; Image adds
 * Instagram + Pinterest; Video → YouTube + TikTok.
 */

type Platform = "facebook" | "instagram" | "threads" | "linkedin" | "pinterest" | "youtube" | "tiktok";
type MediaType = "text" | "image" | "video";

type Day = {
  weekday: number;
  enabled: boolean;
  postHour: number;
  postMinute: number;
  timezone: string;
  mediaType: MediaType;
  channels: Platform[] | null;
  topic: string;
  topics: string[];
};

const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const LABELS: Record<Platform, string> = {
  facebook: "Facebook",
  instagram: "Instagram",
  threads: "Threads",
  linkedin: "LinkedIn",
  pinterest: "Pinterest",
  youtube: "YouTube",
  tiktok: "TikTok",
};
const TEXT_PLATFORMS: Platform[] = ["facebook", "threads", "linkedin"];
const IMAGE_PLATFORMS: Platform[] = ["facebook", "instagram", "threads", "linkedin", "pinterest"];
const VIDEO_PLATFORMS: Platform[] = ["youtube", "tiktok"];

function platformsFor(mediaType: MediaType): Platform[] {
  return mediaType === "video" ? VIDEO_PLATFORMS : mediaType === "image" ? IMAGE_PLATFORMS : TEXT_PLATFORMS;
}

const hhmm = (h: number, m: number) => `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;

export default function WeeklySchedule() {
  const [days, setDays] = useState<Day[] | null>(null);
  const [presets, setPresets] = useState<string[]>([]);
  // The shared rotation pool — content rotates through these across posting days.
  const [topics, setTopics] = useState<string[]>([]);
  const [customTopic, setCustomTopic] = useState("");
  // null until loaded — we only mark channels unconnected once we know.
  const [connected, setConnected] = useState<string[] | null>(null);
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
        connected?: string[];
        topicPresets?: string[];
        configured?: boolean;
      };
      if (!b.ok || !b.days) return;
      const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || "America/Los_Angeles";
      const loaded = b.days.map((d) => ({
        ...d,
        mediaType: d.mediaType ?? "text",
        timezone: d.timezone || tz,
        topics: Array.isArray(d.topics) ? d.topics : [],
      }));
      setDays(loaded);
      // The pool is shared across days: union of stored pools, seeded from the
      // legacy per-day topics for schedules created before rotation existed.
      const pool = [...new Set(loaded.flatMap((d) => d.topics))];
      const legacy = [...new Set(loaded.map((d) => d.topic).filter(Boolean))];
      setTopics(pool.length > 0 ? pool : legacy);
      setPresets(b.topicPresets ?? []);
      setConnected(b.connected ?? null);
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

  function setMediaType(day: Day, mediaType: MediaType) {
    // Content type determines the available channels — reset to "all" on change.
    patch(day.weekday, { mediaType, channels: null });
  }

  function togglePlatform(day: Day, p: Platform) {
    const all = platformsFor(day.mediaType);
    const cur = day.channels ?? all;
    const set = new Set(cur);
    if (set.has(p)) set.delete(p);
    else set.add(p);
    const arr = all.filter((x) => set.has(x));
    patch(day.weekday, { channels: arr.length === 0 || arr.length === all.length ? null : arr });
  }

  function toggleTopic(t: string) {
    setTopics((cur) => (cur.includes(t) ? cur.filter((x) => x !== t) : [...cur, t]));
    setNote(null);
  }

  function addCustomTopic() {
    const t = customTopic.trim();
    if (!t) return;
    setTopics((cur) => (cur.includes(t) ? cur : [...cur, t]));
    setCustomTopic("");
    setNote(null);
  }

  function enableAllDays() {
    setDays((cur) => cur?.map((d) => ({ ...d, enabled: true })) ?? cur);
    setNote(null);
  }

  async function save() {
    if (!days) return;
    if (days.some((d) => d.enabled) && topics.length === 0) {
      setError("Pick at least one topic — posts rotate through them.");
      return;
    }
    setSaving(true);
    setError(null);
    setNote(null);
    try {
      const res = await fetch("/api/weekly-schedule", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        // The pool is shared: every day carries the same rotation topics.
        body: JSON.stringify({ days: days.map((d) => ({ ...d, topics })) }),
      });
      const b = (await res.json().catch(() => ({}))) as { ok?: boolean; days?: Day[]; error?: string };
      if (!res.ok || !b.ok) {
        setError(b.error ?? "Couldn't save.");
        return;
      }
      if (b.days) {
        const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || "America/Los_Angeles";
        setDays(
          b.days.map((d) => ({
            ...d,
            mediaType: d.mediaType ?? "text",
            timezone: d.timezone || tz,
            topics: Array.isArray(d.topics) ? d.topics : [],
          })),
        );
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
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-neutral-900">Weekly post schedule</h2>
          <p className="mt-0.5 text-xs text-neutral-500">
            Pick your topics once — every posting day takes the next one in rotation, so daily posting never repeats
            itself. AI researches each topic and posts automatically. Text → Facebook, Threads, LinkedIn. Image adds
            Instagram + Pinterest. Video → YouTube + TikTok (image/video generation spends credits).
          </p>
        </div>
        <button
          type="button"
          onClick={enableAllDays}
          className="shrink-0 rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-1.5 text-xs font-medium text-indigo-700 hover:bg-indigo-100"
        >
          Post every day
        </button>
      </div>

      {/* The rotation pool — shared across all posting days. */}
      <div className="rounded-xl border border-neutral-200 bg-white p-3">
        <div className="text-sm font-semibold text-neutral-900">
          Topics <span className="font-normal text-neutral-400">· content rotates through your selection</span>
        </div>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {[...new Set([...presets, ...topics])].map((t) => {
            const on = topics.includes(t);
            return (
              <button
                key={t}
                type="button"
                onClick={() => toggleTopic(t)}
                className={`rounded-full border px-2.5 py-1 text-[11px] font-medium ${
                  on ? "border-indigo-400 bg-indigo-50 text-neutral-900" : "border-neutral-200 text-neutral-500 hover:text-neutral-800"
                }`}
              >
                {on ? "✓ " : ""}
                {t}
              </button>
            );
          })}
        </div>
        <div className="mt-2 flex items-center gap-2">
          <input
            type="text"
            value={customTopic}
            onChange={(e) => setCustomTopic(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && addCustomTopic()}
            placeholder="Add your own topic…"
            className="min-w-[200px] flex-1 rounded-lg border border-neutral-300 px-2 py-1 text-sm"
          />
          <button
            type="button"
            onClick={addCustomTopic}
            className="rounded-lg border border-neutral-300 px-3 py-1 text-sm text-neutral-700 hover:bg-neutral-50"
          >
            Add
          </button>
        </div>
        {topics.length > 0 ? (
          <p className="mt-1.5 text-[11px] text-neutral-400">
            {topics.length} topic{topics.length === 1 ? "" : "s"} in rotation — each posting day takes the next one.
          </p>
        ) : (
          <p className="mt-1.5 text-[11px] text-amber-600">Pick at least one topic to enable posting.</p>
        )}
      </div>

      {!configured ? (
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[12px] text-amber-800">
          Not enabled yet (needs <code>ANTHROPIC_API_KEY</code>).
        </p>
      ) : null}

      <ul className="space-y-2">
        {days.map((d) => {
          const all = platformsFor(d.mediaType);
          const selected = d.channels ?? all;
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
                  <div className="flex flex-wrap items-center gap-2">
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
                    <span className="ml-2 inline-flex overflow-hidden rounded-lg border border-neutral-300 text-[11px] font-medium">
                      {(["text", "image", "video"] as MediaType[]).map((t) => (
                        <button
                          key={t}
                          type="button"
                          onClick={() => setMediaType(d, t)}
                          className={`px-3 py-1 ${
                            d.mediaType === t ? "bg-indigo-600 text-white" : "bg-white text-neutral-600"
                          }`}
                        >
                          {t === "text" ? "Text" : t === "image" ? "Image" : "Video"}
                        </button>
                      ))}
                    </span>
                  </div>

                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="text-[11px] font-medium text-neutral-500">Channels</span>
                    {all.map((p) => {
                      // A channel that isn't connected can't be posted to — show it
                      // as a connect link, not a selectable-looking toggle.
                      if (connected !== null && !connected.includes(p)) {
                        return (
                          <a
                            key={p}
                            href="/settings?tab=connections"
                            title={`${LABELS[p]} isn't connected — click to connect it`}
                            className="rounded-full border border-dashed border-neutral-300 px-2.5 py-0.5 text-[11px] font-medium text-neutral-400 hover:text-neutral-700"
                          >
                            + {LABELS[p]}
                          </a>
                        );
                      }
                      return (
                        <button
                          key={p}
                          type="button"
                          onClick={() => togglePlatform(d, p)}
                          className={`rounded-full border px-2.5 py-0.5 text-[11px] font-medium ${
                            selected.includes(p)
                              ? "border-indigo-400 bg-indigo-50 text-neutral-900"
                              : "border-neutral-200 text-neutral-500"
                          }`}
                        >
                          {LABELS[p]}
                        </button>
                      );
                    })}
                    {d.channels === null ? (
                      <span className="text-[10px] text-neutral-400">
                        {connected === null
                          ? "posts to all connected channels"
                          : (() => {
                              const live = all.filter((p) => connected.includes(p));
                              return live.length > 0
                                ? `posts to all connected: ${live.map((p) => LABELS[p]).join(", ")}`
                                : "no channels connected yet";
                            })()}
                      </span>
                    ) : null}
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
