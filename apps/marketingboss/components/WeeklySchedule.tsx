"use client";

import { useCallback, useEffect, useState } from "react";

/**
 * Weekly Social Schedule (MarketingBoss), v3.
 *
 * - Topics are managed with a dual-listbox: SELECTED (left — the rotation, in
 *   order) and AVAILABLE (right — presets + your custom topics). Highlight
 *   items and use ← / → to move them. Every run takes the next selected topic.
 * - Days are simple chips; RUNS are times of day — "Add a run" posts 2-3+
 *   times a day, each run with its own content type and channels.
 */

type Platform = "facebook" | "instagram" | "threads" | "linkedin" | "pinterest" | "youtube" | "tiktok";
type MediaType = "text" | "image" | "video";

type Run = { hour: number; minute: number; mediaType: MediaType; channels: Platform[] | null };

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
  runs: Run[];
};

type BusinessProfile = {
  companyUrl: string | null;
  name: string | null;
  summary: string | null;
  audience: string | null;
  topicPresets: string[];
};

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
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

const MAX_RUNS = 6;

export default function WeeklySchedule() {
  const [days, setDays] = useState<Day[] | null>(null);
  const [presets, setPresets] = useState<string[]>([]);
  // Business profile: URL → researched info + topics tailored to the business.
  const [profile, setProfile] = useState<BusinessProfile | null>(null);
  const [companyUrl, setCompanyUrl] = useState("");
  const [researching, setResearching] = useState(false);
  const [profileError, setProfileError] = useState<string | null>(null);
  // Rotation list (left box) + user-added custom topics (live in the right box until moved).
  const [selected, setSelected] = useState<string[]>([]);
  const [customs, setCustoms] = useState<string[]>([]);
  const [customTopic, setCustomTopic] = useState("");
  // Highlights for the transfer arrows.
  const [hlAvail, setHlAvail] = useState<Set<string>>(new Set());
  const [hlSel, setHlSel] = useState<Set<string>>(new Set());
  // Shared runs (applied to every posting day).
  const [runs, setRuns] = useState<Run[]>([{ hour: 9, minute: 0, mediaType: "text", channels: null }]);
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
        profile?: BusinessProfile | null;
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
        runs: Array.isArray(d.runs) && d.runs.length ? d.runs : [{ hour: d.postHour ?? 9, minute: d.postMinute ?? 0, mediaType: d.mediaType ?? "text", channels: d.channels ?? null }],
      }));
      setDays(loaded);
      const pres = b.topicPresets ?? [];
      // Rotation pool: union of stored pools, seeded from legacy per-day topics.
      const pool = [...new Set(loaded.flatMap((d) => d.topics))];
      const legacy = [...new Set(loaded.map((d) => d.topic).filter(Boolean))];
      const sel = pool.length > 0 ? pool : legacy;
      setSelected(sel);
      setCustoms(sel.filter((t) => !pres.includes(t)));
      // Shared runs: from the first enabled day (else the first day).
      const src = loaded.find((d) => d.enabled) ?? loaded[0];
      if (src) setRuns(src.runs);
      setPresets(pres);
      if (b.profile) {
        setProfile(b.profile);
        setCompanyUrl(b.profile.companyUrl ?? "");
      }
      setConnected(b.connected ?? null);
      setConfigured(b.configured ?? true);
    } catch {
      /* best-effort */
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // ── Business profile ───────────────────────────────────────────────────────

  async function researchCompany() {
    const url = companyUrl.trim();
    if (!url || researching) return;
    setResearching(true);
    setProfileError(null);
    try {
      const res = await fetch("/api/business-profile", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ url }),
      });
      const b = (await res.json().catch(() => null)) as { ok?: boolean; profile?: BusinessProfile; error?: string } | null;
      if (!res.ok || !b?.profile) {
        throw new Error(b?.error || "The research ran long or failed — please try again.");
      }
      setProfile(b.profile);
    } catch (e) {
      setProfileError(e instanceof Error ? e.message : "Couldn't research that site — please try again.");
    } finally {
      setResearching(false);
    }
  }

  // ── Topics (dual listbox) ──────────────────────────────────────────────────

  // Business-specific topics first, generic presets after.
  const businessPresets = profile?.topicPresets ?? [];
  const available = [...new Set([...businessPresets, ...presets, ...customs])].filter((t) => !selected.includes(t));

  function toggleHl(set: Set<string>, setter: (s: Set<string>) => void, t: string) {
    const next = new Set(set);
    if (next.has(t)) next.delete(t);
    else next.add(t);
    setter(next);
  }

  /** ← move highlighted AVAILABLE topics into the rotation. */
  function moveIn() {
    const move = available.filter((t) => hlAvail.has(t));
    if (move.length === 0) return;
    setSelected((cur) => [...cur, ...move]);
    setHlAvail(new Set());
    setNote(null);
  }

  /** → remove highlighted SELECTED topics from the rotation. */
  function moveOut() {
    const move = selected.filter((t) => hlSel.has(t));
    if (move.length === 0) return;
    setSelected((cur) => cur.filter((t) => !hlSel.has(t)));
    // Custom topics return to the right box; presets are already there.
    setCustoms((cur) => [...new Set([...cur, ...move.filter((t) => !presets.includes(t))])]);
    setHlSel(new Set());
    setNote(null);
  }

  function addCustomTopic() {
    const t = customTopic.trim().slice(0, 300);
    if (!t) return;
    if (!presets.includes(t) && !customs.includes(t) && !selected.includes(t)) setCustoms((cur) => [...cur, t]);
    setCustomTopic("");
    setNote(null);
  }

  function deleteCustom(t: string) {
    setCustoms((cur) => cur.filter((x) => x !== t));
    setHlAvail((cur) => {
      const next = new Set(cur);
      next.delete(t);
      return next;
    });
  }

  // ── Runs ───────────────────────────────────────────────────────────────────

  function patchRun(i: number, next: Partial<Run>) {
    setRuns((cur) => cur.map((r, x) => (x === i ? { ...r, ...next } : r)));
    setNote(null);
  }

  function setRunMedia(i: number, mediaType: MediaType) {
    // Content type determines the available channels — reset to "all" on change.
    patchRun(i, { mediaType, channels: null });
  }

  function toggleRunPlatform(i: number, p: Platform) {
    const run = runs[i];
    const all = platformsFor(run.mediaType);
    const cur = run.channels ?? all;
    const set = new Set(cur);
    if (set.has(p)) set.delete(p);
    else set.add(p);
    const arr = all.filter((x) => set.has(x));
    patchRun(i, { channels: arr.length === 0 || arr.length === all.length ? null : arr });
  }

  function addRun() {
    if (runs.length >= MAX_RUNS) return;
    const last = runs[runs.length - 1];
    const hour = Math.min(23, (last?.hour ?? 9) + 6);
    setRuns((cur) => [...cur, { hour, minute: 0, mediaType: last?.mediaType ?? "text", channels: null }]);
    setNote(null);
  }

  function removeRun(i: number) {
    setRuns((cur) => (cur.length <= 1 ? cur : cur.filter((_, x) => x !== i)));
    setNote(null);
  }

  // ── Days + save ────────────────────────────────────────────────────────────

  function toggleDay(weekday: number) {
    setDays((cur) => cur?.map((d) => (d.weekday === weekday ? { ...d, enabled: !d.enabled } : d)) ?? cur);
    setNote(null);
  }

  function enableAllDays() {
    setDays((cur) => cur?.map((d) => ({ ...d, enabled: true })) ?? cur);
    setNote(null);
  }

  async function save() {
    if (!days) return;
    const anyDay = days.some((d) => d.enabled);
    if (anyDay && selected.length === 0) {
      setError("Move at least one topic into the rotation (left box).");
      return;
    }
    setSaving(true);
    setError(null);
    setNote(null);
    try {
      const res = await fetch("/api/weekly-schedule", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        // Topics + runs are shared: every day carries the same rotation + runs.
        body: JSON.stringify({ days: days.map((d) => ({ ...d, topics: selected, runs })) }),
      });
      const b = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!res.ok || !b.ok) {
        setError(b.error ?? "Couldn't save.");
        return;
      }
      setNote("Schedule saved.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Network error.");
    } finally {
      setSaving(false);
    }
  }

  if (!days) return <div className="py-4 text-sm text-neutral-500">Loading your weekly schedule…</div>;

  const enabledCount = days.filter((d) => d.enabled).length;
  const perWeek = enabledCount * runs.length;
  const listCls = "h-48 w-full overflow-y-auto rounded-lg border border-neutral-200 bg-white p-1";
  const itemCls = (hl: boolean) =>
    `flex w-full items-center gap-1.5 rounded-md px-2 py-1.5 text-left text-[12px] ${
      hl ? "bg-indigo-100 text-neutral-900" : "text-neutral-700 hover:bg-neutral-50"
    }`;

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-base font-semibold text-neutral-900">Posting schedule</h2>
        <p className="mt-0.5 text-xs text-neutral-500">
          Build your rotation (left box), pick your days, and add runs — each run posts at its time and takes the next
          topic in the rotation. Text → Facebook, Threads, LinkedIn. Image adds Instagram + Pinterest. Video → YouTube +
          TikTok (image/video generation spends credits).
        </p>
      </div>

      {!configured ? (
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[12px] text-amber-800">
          Not enabled yet (needs <code>ANTHROPIC_API_KEY</code>).
        </p>
      ) : null}

      {/* Business profile — URL → researched info + tailored topics */}
      <div className="rounded-xl border border-neutral-200 bg-white p-3">
        <div className="text-[11px] font-semibold uppercase tracking-wide text-neutral-500">Your business</div>
        <div className="mt-1.5 flex flex-wrap items-center gap-2">
          <input
            type="url"
            value={companyUrl}
            onChange={(e) => setCompanyUrl(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && void researchCompany()}
            placeholder="https://your-company.com"
            className="min-w-[220px] flex-1 rounded-lg border border-neutral-300 px-2 py-1.5 text-sm"
          />
          <button
            type="button"
            onClick={() => void researchCompany()}
            disabled={researching || !companyUrl.trim() || !configured}
            title={configured ? "Research the site and generate topics for this business" : "Needs ANTHROPIC_API_KEY"}
            className="rounded-lg bg-indigo-600 px-3.5 py-1.5 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-40"
          >
            {researching ? "Researching…" : profile ? "Re-research" : "Fill from website"}
          </button>
        </div>
        {researching && (
          <p className="mt-1.5 text-[11px] text-neutral-500">
            Reading your site and generating topics for your business — this can take a minute or two.
          </p>
        )}
        {profileError && <p className="mt-1.5 text-[11px] text-red-600">{profileError}</p>}
        {profile && !researching && (
          <div className="mt-2 rounded-lg bg-neutral-50 p-2.5 text-[12px] text-neutral-600">
            {profile.name && <span className="font-semibold text-neutral-900">{profile.name}. </span>}
            {profile.summary}
            {profile.audience && (
              <span className="text-neutral-500">
                {" "}
                Audience: {profile.audience}
              </span>
            )}
            {profile.topicPresets.length > 0 && (
              <span className="mt-1 block text-[11px] text-indigo-600">
                ✨ {profile.topicPresets.length} topics generated for your business — find them at the top of Available.
              </span>
            )}
          </div>
        )}
      </div>

      {/* Topics — dual listbox */}
      <div className="rounded-xl border border-neutral-200 bg-white p-3">
        <div className="grid grid-cols-[1fr_auto_1fr] items-stretch gap-2">
          <div>
            <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-neutral-500">
              Selected — rotates in this order
            </div>
            <div className={listCls}>
              {selected.length === 0 ? (
                <p className="px-2 py-1.5 text-[12px] text-neutral-400">Nothing selected yet — highlight topics on the right and press ←</p>
              ) : (
                selected.map((t, i) => (
                  <button key={t} type="button" onClick={() => toggleHl(hlSel, setHlSel, t)} className={itemCls(hlSel.has(t))}>
                    <span className="w-5 shrink-0 text-right text-[11px] text-neutral-400">{i + 1}.</span>
                    <span className="min-w-0 flex-1 truncate">{t}</span>
                  </button>
                ))
              )}
            </div>
          </div>

          <div className="flex flex-col items-center justify-center gap-2">
            <button
              type="button"
              onClick={moveIn}
              disabled={![...hlAvail].some((t) => available.includes(t))}
              title="Add highlighted topics to the rotation"
              className="rounded-lg border border-neutral-300 px-2.5 py-1.5 text-sm font-semibold text-neutral-700 hover:bg-neutral-50 disabled:opacity-30"
            >
              ←
            </button>
            <button
              type="button"
              onClick={moveOut}
              disabled={![...hlSel].some((t) => selected.includes(t))}
              title="Remove highlighted topics from the rotation"
              className="rounded-lg border border-neutral-300 px-2.5 py-1.5 text-sm font-semibold text-neutral-700 hover:bg-neutral-50 disabled:opacity-30"
            >
              →
            </button>
          </div>

          <div>
            <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-neutral-500">Available topics</div>
            <div className={listCls}>
              {available.map((t) => (
                <div key={t} className="flex items-center">
                  <button type="button" onClick={() => toggleHl(hlAvail, setHlAvail, t)} className={itemCls(hlAvail.has(t))}>
                    <span className="min-w-0 flex-1 truncate">
                      {businessPresets.includes(t) ? "✨ " : ""}
                      {t}
                    </span>
                  </button>
                  {customs.includes(t) && (
                    <button
                      type="button"
                      onClick={() => deleteCustom(t)}
                      title="Delete this custom topic"
                      className="shrink-0 px-1.5 text-[12px] text-neutral-400 hover:text-red-600"
                    >
                      ✕
                    </button>
                  )}
                </div>
              ))}
            </div>
            <div className="mt-1.5 flex items-center gap-1.5">
              <input
                type="text"
                value={customTopic}
                onChange={(e) => setCustomTopic(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && addCustomTopic()}
                placeholder="Add your own topic…"
                className="min-w-0 flex-1 rounded-lg border border-neutral-300 px-2 py-1 text-sm"
              />
              <button
                type="button"
                onClick={addCustomTopic}
                className="rounded-lg border border-neutral-300 px-2.5 py-1 text-sm text-neutral-700 hover:bg-neutral-50"
              >
                Add
              </button>
            </div>
          </div>
        </div>
        <p className="mt-1.5 text-[11px] text-neutral-400">
          {selected.length > 0
            ? `${selected.length} topic${selected.length === 1 ? "" : "s"} in rotation — every run takes the next one.`
            : "The rotation is empty."}
        </p>
      </div>

      {/* Days */}
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="text-[11px] font-medium text-neutral-500">Days</span>
        {days.map((d) => (
          <button
            key={d.weekday}
            type="button"
            onClick={() => toggleDay(d.weekday)}
            className={`rounded-full border px-3 py-1 text-[12px] font-medium ${
              d.enabled ? "border-indigo-400 bg-indigo-50 text-neutral-900" : "border-neutral-200 text-neutral-500 hover:text-neutral-800"
            }`}
          >
            {WEEKDAYS[d.weekday]}
          </button>
        ))}
        <button
          type="button"
          onClick={enableAllDays}
          className="ml-1 rounded-lg border border-indigo-200 bg-indigo-50 px-2.5 py-1 text-[12px] font-medium text-indigo-700 hover:bg-indigo-100"
        >
          Every day
        </button>
      </div>

      {/* Runs */}
      <div className="space-y-2">
        {runs.map((run, i) => {
          const all = platformsFor(run.mediaType);
          const sel = run.channels ?? all;
          return (
            <div key={i} className="rounded-xl border border-neutral-200 bg-white p-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-[11px] font-semibold text-neutral-500">Run {i + 1}</span>
                <input
                  type="time"
                  value={hhmm(run.hour, run.minute)}
                  onChange={(e) => {
                    const [h, m] = e.target.value.split(":").map((n) => parseInt(n, 10));
                    patchRun(i, { hour: h || 0, minute: m || 0 });
                  }}
                  className="rounded-lg border border-neutral-300 px-2 py-1 text-sm"
                />
                <span className="text-[10px] text-neutral-400">{days[0]?.timezone}</span>
                <span className="inline-flex overflow-hidden rounded-lg border border-neutral-300 text-[11px] font-medium">
                  {(["text", "image", "video"] as MediaType[]).map((t) => (
                    <button
                      key={t}
                      type="button"
                      onClick={() => setRunMedia(i, t)}
                      className={`px-3 py-1 ${run.mediaType === t ? "bg-indigo-600 text-white" : "bg-white text-neutral-600"}`}
                    >
                      {t === "text" ? "Text" : t === "image" ? "Image" : "Video"}
                    </button>
                  ))}
                </span>
                {runs.length > 1 && (
                  <button
                    type="button"
                    onClick={() => removeRun(i)}
                    title="Remove this run"
                    className="ml-auto text-[12px] text-neutral-400 hover:text-red-600"
                  >
                    ✕ Remove
                  </button>
                )}
              </div>

              <div className="mt-2 flex flex-wrap items-center gap-1.5">
                <span className="text-[11px] font-medium text-neutral-500">Channels</span>
                {all.map((p) => {
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
                      onClick={() => toggleRunPlatform(i, p)}
                      className={`rounded-full border px-2.5 py-0.5 text-[11px] font-medium ${
                        sel.includes(p) ? "border-indigo-400 bg-indigo-50 text-neutral-900" : "border-neutral-200 text-neutral-500"
                      }`}
                    >
                      {LABELS[p]}
                    </button>
                  );
                })}
                {run.channels === null ? (
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
          );
        })}
        <button
          type="button"
          onClick={addRun}
          disabled={runs.length >= MAX_RUNS}
          className="rounded-lg border border-dashed border-neutral-300 px-3 py-1.5 text-sm text-neutral-600 hover:border-neutral-400 hover:text-neutral-900 disabled:opacity-40"
        >
          + Add a run
        </button>
      </div>

      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => void save()}
          disabled={saving}
          className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
        >
          {saving ? "Saving…" : "Save schedule"}
        </button>
        {enabledCount > 0 && (
          <span className="text-[11px] text-neutral-400">
            {enabledCount} day{enabledCount === 1 ? "" : "s"} × {runs.length} run{runs.length === 1 ? "" : "s"} ={" "}
            {perWeek} post{perWeek === 1 ? "" : "s"}/week
          </span>
        )}
        {note ? <span className="text-sm text-green-700">{note}</span> : null}
        {error ? <span className="text-sm text-red-600">{error}</span> : null}
      </div>
    </div>
  );
}
