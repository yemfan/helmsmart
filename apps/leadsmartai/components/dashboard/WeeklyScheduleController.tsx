"use client";

import { useCallback, useEffect, useState } from "react";

/**
 * Weekly Social Schedule — check the days you want a post, and per checked day
 * set a time, a content type (text or image), channels, and a topic. AI
 * researches the topic and publishes on schedule. Text posts → Facebook /
 * LinkedIn / Threads; image posts render a branded card and additionally reach
 * Instagram + Pinterest. Config for CloseBoss; a sibling exists in MarketingBoss.
 */

type Platform = "facebook" | "instagram" | "linkedin" | "threads" | "pinterest" | "tiktok" | "youtube";
type MediaType = "text" | "image" | "video";

type Day = {
  weekday: number;
  enabled: boolean;
  postHour: number;
  postMinute: number;
  timezone: string;
  mediaType: MediaType;
  platforms: Platform[] | null; // null = all of this content type
  topic: string;
};

const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const LABELS: Record<Platform, string> = {
  facebook: "Facebook",
  instagram: "Instagram",
  linkedin: "LinkedIn",
  threads: "Threads",
  pinterest: "Pinterest",
  tiktok: "TikTok",
  youtube: "YouTube",
};
const TEXT_PLATFORMS: Platform[] = ["facebook", "linkedin", "threads"];
const IMAGE_PLATFORMS: Platform[] = ["facebook", "instagram", "linkedin", "threads", "pinterest"];
const VIDEO_PLATFORMS: Platform[] = ["facebook", "instagram", "linkedin", "tiktok", "youtube"];

function platformsFor(mediaType: MediaType): Platform[] {
  return mediaType === "video" ? VIDEO_PLATFORMS : mediaType === "image" ? IMAGE_PLATFORMS : TEXT_PLATFORMS;
}

function hhmm(h: number, m: number): string {
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

export default function WeeklyScheduleController() {
  const [days, setDays] = useState<Day[] | null>(null);
  const [presets, setPresets] = useState<string[]>([]);
  const [configured, setConfigured] = useState(true);
  const [videoReady, setVideoReady] = useState(false);
  const [saving, setSaving] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/social/weekly-schedule");
      const b = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        configured?: boolean;
        days?: Day[];
        topicPresets?: string[];
        videoReady?: boolean;
      };
      if (!b.ok || !b.days) return;
      const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || "America/Los_Angeles";
      // Default any never-saved day to the viewer's timezone; default content type to text.
      setDays(b.days.map((d) => ({ ...d, mediaType: d.mediaType ?? "text", timezone: d.timezone || tz })));
      setPresets(b.topicPresets ?? []);
      setConfigured(b.configured ?? true);
      setVideoReady(b.videoReady ?? false);
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
    // Changing content type resets channels to "all" (the platform sets differ).
    patch(day.weekday, { mediaType, platforms: null });
  }

  function togglePlatform(day: Day, p: Platform) {
    const all = platformsFor(day.mediaType);
    const current = day.platforms ?? all;
    const set = new Set(current);
    if (set.has(p)) set.delete(p);
    else set.add(p);
    const arr = all.filter((x) => set.has(x));
    // All selected (or none) → null meaning "all connected".
    patch(day.weekday, { platforms: arr.length === 0 || arr.length === all.length ? null : arr });
  }

  async function save() {
    if (!days) return;
    setSaving(true);
    setError(null);
    setNote(null);
    try {
      const res = await fetch("/api/social/weekly-schedule", {
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
        setDays(b.days.map((d) => ({ ...d, mediaType: d.mediaType ?? "text", timezone: d.timezone || tz })));
      }
      setNote("Schedule saved.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Network error.");
    } finally {
      setSaving(false);
    }
  }

  if (!days) {
    return <div className="py-4 text-sm text-gray-500">Loading your weekly schedule…</div>;
  }

  return (
    <div className="space-y-3">
      <p className="text-xs text-gray-600">
        Pick the days you want a post to go out. For each day, choose text, an image, or a video, set a time, the
        channels, and a topic — AI researches the topic and writes + publishes the post automatically. Text → Facebook,
        LinkedIn, Threads. Image renders a branded card and also reaches Instagram + Pinterest. Video films your digital
        twin delivering the topic → Facebook, Instagram, LinkedIn, TikTok, YouTube.
      </p>

      {!configured ? (
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[12px] text-amber-800">
          Not enabled yet (needs <code>ANTHROPIC_API_KEY</code>).
        </p>
      ) : null}

      <ul className="space-y-2">
        {days.map((d) => {
          const all = platformsFor(d.mediaType);
          const selected = d.platforms ?? all;
          const allSelected = d.platforms === null;
          return (
            <li key={d.weekday} className="rounded-xl border border-gray-200 bg-white p-3">
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={d.enabled}
                  onChange={(e) => patch(d.weekday, { enabled: e.target.checked })}
                  className="accent-brand-accent"
                />
                <span className="text-sm font-semibold text-gray-900">{WEEKDAYS[d.weekday]}</span>
              </label>

              {d.enabled ? (
                <div className="mt-3 grid gap-3 sm:grid-cols-[auto,1fr]">
                  <div className="flex flex-col gap-2">
                    <div className="flex items-center gap-2">
                      <span className="text-[11px] font-medium text-gray-500">Time</span>
                      <input
                        type="time"
                        value={hhmm(d.postHour, d.postMinute)}
                        onChange={(e) => {
                          const [h, m] = e.target.value.split(":").map((n) => parseInt(n, 10));
                          patch(d.weekday, { postHour: h || 0, postMinute: m || 0 });
                        }}
                        className="rounded-lg border border-gray-300 px-2 py-1 text-sm"
                      />
                      <span className="text-[10px] text-gray-400">{d.timezone}</span>
                    </div>
                    <div className="inline-flex overflow-hidden rounded-lg border border-gray-300 text-[11px] font-medium">
                      {(["text", "image", "video"] as MediaType[]).map((t) => (
                        <button
                          key={t}
                          type="button"
                          onClick={() => setMediaType(d, t)}
                          className={`px-3 py-1 ${
                            d.mediaType === t ? "bg-brand-accent text-white" : "bg-white text-gray-600"
                          }`}
                        >
                          {t === "text" ? "Text" : t === "image" ? "Image" : "Video"}
                        </button>
                      ))}
                    </div>
                    {d.mediaType === "video" && !videoReady ? (
                      <p className="text-[10px] leading-tight text-amber-700">
                        Video uses your digital twin — set up your intro video + cloned voice first (Digital Twin) or
                        this day won&apos;t post.
                      </p>
                    ) : null}
                  </div>

                  <div className="space-y-2">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="text-[11px] font-medium text-gray-500">Channels</span>
                      {all.map((p) => (
                        <button
                          key={p}
                          type="button"
                          onClick={() => togglePlatform(d, p)}
                          className={`rounded-full border px-2.5 py-0.5 text-[11px] font-medium ${
                            selected.includes(p)
                              ? "border-brand-accent bg-brand-accent/10 text-gray-900"
                              : "border-gray-200 text-gray-500"
                          }`}
                        >
                          {LABELS[p]}
                        </button>
                      ))}
                      <span className="text-[10px] text-gray-400">{allSelected ? "all connected" : ""}</span>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-[11px] font-medium text-gray-500">Topic</span>
                      <select
                        value={presets.includes(d.topic) ? d.topic : ""}
                        onChange={(e) => e.target.value && patch(d.weekday, { topic: e.target.value })}
                        className="rounded-lg border border-gray-300 bg-white px-2 py-1 text-sm"
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
                        className="min-w-[180px] flex-1 rounded-lg border border-gray-300 px-2 py-1 text-sm"
                      />
                    </div>
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
          className="rounded-lg bg-brand-accent px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          {saving ? "Saving…" : "Save schedule"}
        </button>
        {note ? <span className="text-sm text-green-700">{note}</span> : null}
        {error ? <span className="text-sm text-red-600">{error}</span> : null}
      </div>
    </div>
  );
}
