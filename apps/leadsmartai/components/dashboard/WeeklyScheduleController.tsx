"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

/**
 * Weekly Social Schedule — check the days you want a post, and per checked day
 * set how many posts, when, a content type (text / image / video), channels,
 * and a topic. AI researches the topic and publishes on schedule. Text posts →
 * Facebook / LinkedIn / Threads; image posts render a branded card and
 * additionally reach Instagram + Pinterest; video posts use the digital twin.
 *
 * Two things can be delegated per day: the publish TIME and the TOPIC. Handing
 * over both means a day the agent never has to think about again — which is the
 * point of "post every day" at the top, since nobody wants to fill in seven
 * identical forms.
 *
 * Config for CloseBoss; a sibling exists in MarketingBoss.
 */

type Platform = "facebook" | "instagram" | "linkedin" | "threads" | "pinterest" | "tiktok" | "youtube";
type MediaType = "text" | "image" | "video";
type TimeMode = "fixed" | "ai";
type TopicMode = "fixed" | "ai";

type Day = {
  weekday: number;
  enabled: boolean;
  postHour: number;
  postMinute: number;
  timezone: string;
  mediaType: MediaType;
  platforms: Platform[] | null; // null = all of this content type
  topic: string;
  postsPerDay: number;
  timeMode: TimeMode;
  topicMode: TopicMode;
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
const POSTS_PER_DAY_CHOICES = [1, 2, 3, 4, 5];

function platformsFor(mediaType: MediaType): Platform[] {
  return mediaType === "video" ? VIDEO_PLATFORMS : mediaType === "image" ? IMAGE_PLATFORMS : TEXT_PLATFORMS;
}

function hhmm(h: number, m: number): string {
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

/** Fill in anything a never-saved row has no value for. */
function hydrate(d: Day, fallbackTz: string): Day {
  return {
    ...d,
    mediaType: d.mediaType ?? "text",
    timezone: d.timezone || fallbackTz,
    postsPerDay: d.postsPerDay ?? 1,
    timeMode: d.timeMode ?? "fixed",
    topicMode: d.topicMode ?? "fixed",
  };
}

export default function WeeklyScheduleController() {
  const { t } = useTranslation("dashboard");
  // The media-type buttons below map over a variable also named `t`.
  const tr = t;
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
      setDays(b.days.map((d) => hydrate(d, tz)));
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

  /**
   * "Post every day" is a bulk switch over the same per-day rows, not a mode of
   * its own — so the days stay individually editable afterwards and there is no
   * second source of truth about which days are on.
   */
  function setEveryDay(on: boolean) {
    setDays((cur) => cur?.map((d) => ({ ...d, enabled: on })) ?? cur);
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
        setError(b.error ?? t("pages.weeklySchedule.saveFailed"));
        return;
      }
      if (b.days) {
        const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || "America/Los_Angeles";
        setDays(b.days.map((d) => hydrate(d, tz)));
      }
      setNote(t("pages.weeklySchedule.saved"));
    } catch (e) {
      setError(e instanceof Error ? e.message : t("pages.weeklySchedule.networkError"));
    } finally {
      setSaving(false);
    }
  }

  if (!days) {
    return <div className="py-4 text-sm text-slate-500">{t("pages.weeklySchedule.loading")}</div>;
  }

  const everyDay = days.every((d) => d.enabled);

  return (
    <div className="space-y-3">
      <p className="text-xs text-slate-600 dark:text-slate-400">
        {t("pages.weeklySchedule.intro")}
      </p>

      {!configured ? (
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[12px] text-amber-800">
          {t("pages.digitalTwin.notEnabledBefore")} <code>ANTHROPIC_API_KEY</code>{t("pages.digitalTwin.notEnabledAfter")}
        </p>
      ) : null}

      <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/60 px-3 py-2">
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={everyDay}
            onChange={(e) => setEveryDay(e.target.checked)}
            className="accent-brand-accent"
          />
          <span className="text-sm font-semibold text-slate-900 dark:text-slate-100">{t("pages.weeklySchedule.everyDay")}</span>
        </label>
        <p className="mt-0.5 pl-6 text-[11px] text-slate-500">{t("pages.weeklySchedule.everyDayHint")}</p>
      </div>

      <ul className="space-y-2">
        {days.map((d) => {
          const all = platformsFor(d.mediaType);
          const selected = d.platforms ?? all;
          const allSelected = d.platforms === null;
          const aiTime = d.timeMode === "ai";
          const aiTopic = d.topicMode === "ai";
          return (
            <li key={d.weekday} className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-3">
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={d.enabled}
                  onChange={(e) => patch(d.weekday, { enabled: e.target.checked })}
                  className="accent-brand-accent"
                />
                <span className="text-sm font-semibold text-slate-900 dark:text-slate-100">{WEEKDAYS[d.weekday]}</span>
              </label>

              {d.enabled ? (
                <div className="mt-3 grid gap-3 sm:grid-cols-[auto,1fr]">
                  <div className="flex flex-col gap-2">
                    <div className="flex items-center gap-2">
                      <span className="text-[11px] font-medium text-slate-500">{t("pages.weeklySchedule.time")}</span>
                      {aiTime ? (
                        <span className="rounded-lg border border-dashed border-slate-300 dark:border-slate-700 px-2 py-1 text-sm text-slate-500">
                          {t("pages.weeklySchedule.aiPicksTimeValue")}
                        </span>
                      ) : (
                        <input
                          type="time"
                          value={hhmm(d.postHour, d.postMinute)}
                          onChange={(e) => {
                            const [h, m] = e.target.value.split(":").map((n) => parseInt(n, 10));
                            patch(d.weekday, { postHour: h || 0, postMinute: m || 0 });
                          }}
                          className="rounded-lg border border-slate-300 dark:border-slate-700 px-2 py-1 text-sm"
                        />
                      )}
                      <span className="text-[10px] text-slate-500">{d.timezone}</span>
                    </div>

                    <label className="flex items-center gap-2 text-[11px] text-slate-600 dark:text-slate-400">
                      <input
                        type="checkbox"
                        checked={aiTime}
                        onChange={(e) => patch(d.weekday, { timeMode: e.target.checked ? "ai" : "fixed" })}
                        className="accent-brand-accent"
                      />
                      {t("pages.weeklySchedule.aiPicksTime")}
                    </label>

                    <div className="flex items-center gap-2">
                      <span className="text-[11px] font-medium text-slate-500">
                        {t("pages.weeklySchedule.postsPerDay")}
                      </span>
                      <select
                        value={d.postsPerDay}
                        onChange={(e) => patch(d.weekday, { postsPerDay: Number(e.target.value) })}
                        className="rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 py-1 text-sm"
                      >
                        {POSTS_PER_DAY_CHOICES.map((n) => (
                          <option key={n} value={n}>
                            {n}
                          </option>
                        ))}
                      </select>
                    </div>
                    {d.postsPerDay > 1 ? (
                      <p className="text-[10px] leading-tight text-slate-500">
                        {aiTime
                          ? t("pages.weeklySchedule.spreadHintAi")
                          : t("pages.weeklySchedule.spreadHintFixed")}
                      </p>
                    ) : null}

                    <div className="inline-flex overflow-hidden rounded-lg border border-slate-300 dark:border-slate-700 text-[11px] font-medium">
                      {(["text", "image", "video"] as MediaType[]).map((t) => (
                        <button
                          key={t}
                          type="button"
                          onClick={() => setMediaType(d, t)}
                          className={`px-3 py-1 ${
                            d.mediaType === t ? "bg-brand-accent text-white" : "bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-400"
                          }`}
                        >
                          {t === "text"
                            ? tr("pages.weeklySchedule.text")
                            : t === "image"
                              ? tr("pages.bossAssistant.image")
                              : tr("pages.weeklySchedule.video")}
                        </button>
                      ))}
                    </div>
                    {d.mediaType === "video" && !videoReady ? (
                      <p className="text-[10px] leading-tight text-amber-700">{t("pages.weeklySchedule.twinWarning")}</p>
                    ) : null}
                  </div>

                  <div className="space-y-2">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="text-[11px] font-medium text-slate-500">{t("pages.weeklySchedule.channels")}</span>
                      {all.map((p) => (
                        <button
                          key={p}
                          type="button"
                          onClick={() => togglePlatform(d, p)}
                          className={`rounded-full border px-2.5 py-0.5 text-[11px] font-medium ${
                            selected.includes(p)
                              ? "border-brand-accent bg-brand-accent/10 text-slate-900 dark:text-slate-100"
                              : "border-slate-200 dark:border-slate-700 text-slate-500"
                          }`}
                        >
                          {LABELS[p]}
                        </button>
                      ))}
                      <span className="text-[10px] text-slate-500">
                        {allSelected ? t("pages.weeklySchedule.allConnected") : ""}
                      </span>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-[11px] font-medium text-slate-500">{t("pages.weeklySchedule.topic")}</span>
                      {aiTopic ? (
                        <span className="rounded-lg border border-dashed border-slate-300 dark:border-slate-700 px-2 py-1 text-sm text-slate-500">
                          {t("pages.weeklySchedule.aiPicksTopicValue")}
                        </span>
                      ) : (
                        <>
                          <select
                            value={presets.includes(d.topic) ? d.topic : ""}
                            onChange={(e) => e.target.value && patch(d.weekday, { topic: e.target.value })}
                            className="rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 py-1 text-sm"
                          >
                            <option value="">{t("pages.weeklySchedule.pickTopic")}</option>
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
                            placeholder={t("pages.weeklySchedule.typeYourOwn")}
                            className="min-w-[180px] flex-1 rounded-lg border border-slate-300 dark:border-slate-700 px-2 py-1 text-sm"
                          />
                        </>
                      )}
                    </div>

                    <label className="flex items-center gap-2 text-[11px] text-slate-600 dark:text-slate-400">
                      <input
                        type="checkbox"
                        checked={aiTopic}
                        onChange={(e) => patch(d.weekday, { topicMode: e.target.checked ? "ai" : "fixed" })}
                        className="accent-brand-accent"
                      />
                      {t("pages.weeklySchedule.aiPicksTopic")}
                    </label>
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
          {saving ? t("common:status.saving") : t("pages.briefingSchedule.saveSchedule")}
        </button>
        {note ? <span className="text-sm text-green-700">{note}</span> : null}
        {error ? <span className="text-sm text-red-600">{error}</span> : null}
      </div>
    </div>
  );
}
