"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

export type ScheduleRow = { id: string; name: string; frequency: number; nextRunAt: string | null };

type PubResult = { platform: string; ok: boolean; url?: string | null; error?: string };
type Metric = { likes?: number; comments?: number; views?: number };
type Post = {
  id: string;
  status: string;
  type: "text" | "image" | "video";
  title: string | null;
  caption: string | null;
  media_url: string | null;
  channels: string[];
  results: PubResult[] | null;
  metrics: Record<string, Metric> | null;
  scheduled_for: string | null;
  published_at: string | null;
  created_at: string;
};

function totalMetrics(metrics: Record<string, Metric> | null): { likes: number; comments: number; views: number } | null {
  if (!metrics || Object.keys(metrics).length === 0) return null;
  let likes = 0,
    comments = 0,
    views = 0;
  for (const m of Object.values(metrics)) {
    likes += m.likes ?? 0;
    comments += m.comments ?? 0;
    views += m.views ?? 0;
  }
  return { likes, comments, views };
}

const LABEL: Record<string, string> = {
  facebook: "Facebook",
  instagram: "Instagram",
  threads: "Threads",
  linkedin: "LinkedIn",
  pinterest: "Pinterest",
  youtube: "YouTube",
  tiktok: "TikTok",
};
const TYPE_EMOJI: Record<string, string> = { text: "✍️", image: "🖼️", video: "🎬" };

function fmt(iso: string | null): string {
  if (!iso) return "";
  try {
    return new Date(iso).toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
  } catch {
    return iso;
  }
}

export default function PostingHub({
  cadences,
  scheduled,
  history,
}: {
  cadences: ScheduleRow[];
  scheduled: Post[];
  history: Post[];
}) {
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    if (!menuOpen) return;
    const onDown = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [menuOpen]);

  async function cancel(id: string) {
    if (busy) return;
    setBusy(id);
    try {
      await fetch(`/api/autopilot/posts/${id}`, { method: "DELETE" });
      router.refresh();
    } finally {
      setBusy(null);
    }
  }

  async function saveFreq(id: string, frequency: number) {
    await fetch(`/api/autopilot/campaigns/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ frequency }),
    });
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-6">
      {/* New posting */}
      <div className="relative flex justify-end" ref={menuRef}>
        <button
          onClick={() => setMenuOpen((o) => !o)}
          className="inline-flex items-center gap-2 rounded-xl bg-boss-gold px-5 py-2.5 text-sm font-semibold text-black transition hover:brightness-105"
        >
          + New posting
          <span className="text-[10px] opacity-70">▼</span>
        </button>
        {menuOpen && (
          <div className="absolute right-0 top-full z-50 mt-2 w-64 overflow-hidden rounded-xl border border-white/10 bg-ink-2 shadow-2xl">
            <Link href="/compose/new" className="block px-4 py-3 transition hover:bg-white/5">
              <div className="text-sm font-semibold text-white">✨ AI posting</div>
              <div className="text-[11px] text-white/45">Write one post now, or schedule it.</div>
            </Link>
            <Link href="/autopilot" className="block border-t border-white/10 px-4 py-3 transition hover:bg-white/5">
              <div className="text-sm font-semibold text-white">🤖 Auto posting</div>
              <div className="text-[11px] text-white/45">Set up a campaign that posts on autopilot.</div>
            </Link>
          </div>
        )}
      </div>

      {/* Schedule (cadences) */}
      <section className="flex flex-col gap-2">
        <h3 className="text-sm font-semibold text-white/80">Posting schedule</h3>
        {cadences.length === 0 ? (
          <p className="rounded-2xl border border-white/10 bg-ink-2/70 p-4 text-sm text-white/50">
            No auto-posting campaigns yet.{" "}
            <Link href="/autopilot" className="text-boss-gold underline underline-offset-2">
              Set one up →
            </Link>
          </p>
        ) : (
          cadences.map((c) => <CadenceRow key={c.id} row={c} onSave={saveFreq} />)
        )}
      </section>

      {/* Scheduled */}
      {scheduled.length > 0 && (
        <section className="flex flex-col gap-2">
          <h3 className="text-sm font-semibold text-white/80">Scheduled ({scheduled.length})</h3>
          {scheduled.map((p) => (
            <div key={p.id} className="flex items-start gap-3 rounded-2xl border border-white/10 bg-ink-2/70 p-4">
              {p.media_url && p.type !== "video" && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={p.media_url} alt="" className="size-14 shrink-0 rounded-lg object-cover" />
              )}
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  <span className="rounded-full bg-boss-violet/20 px-2 py-0.5 font-semibold text-boss-violet">
                    {fmt(p.scheduled_for)}
                  </span>
                  <span className="text-white/45">
                    {TYPE_EMOJI[p.type]} {p.channels.map((c) => LABEL[c] ?? c).join(", ")}
                  </span>
                </div>
                <p className="mt-1 line-clamp-2 text-sm text-white/70">{p.caption}</p>
              </div>
              <button
                onClick={() => cancel(p.id)}
                disabled={busy === p.id}
                className="shrink-0 rounded-lg border border-white/10 px-3 py-1.5 text-xs text-white/55 transition hover:text-white disabled:opacity-40"
              >
                Cancel
              </button>
            </div>
          ))}
        </section>
      )}

      {/* History */}
      <section className="flex flex-col gap-2">
        <h3 className="text-sm font-semibold text-white/80">Posting history</h3>
        {history.length === 0 ? (
          <p className="rounded-2xl border border-white/10 bg-ink-2/70 p-4 text-sm text-white/50">
            Nothing published yet.
          </p>
        ) : (
          history.map((p) => (
            <div key={p.id} className="flex items-start gap-3 rounded-2xl border border-white/10 bg-ink-2/70 p-4">
              {p.media_url && p.type !== "video" && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={p.media_url} alt="" className="size-14 shrink-0 rounded-lg object-cover" />
              )}
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  <span
                    className={`rounded-full px-2 py-0.5 font-semibold capitalize ${
                      p.status === "published" ? "bg-emerald-500/15 text-emerald-300" : "bg-red-500/15 text-red-300"
                    }`}
                  >
                    {p.status}
                  </span>
                  <span className="text-white/40">{fmt(p.published_at || p.created_at)}</span>
                  <span className="text-white/45">{TYPE_EMOJI[p.type]}</span>
                </div>
                <p className="mt-1 line-clamp-2 text-sm text-white/70">{p.caption}</p>
                {(() => {
                  const t = totalMetrics(p.metrics);
                  return t ? (
                    <div className="mt-1 flex flex-wrap gap-x-3 text-[11px] text-white/55">
                      <span>♥ {t.likes}</span>
                      <span>💬 {t.comments}</span>
                      {t.views > 0 && <span>▶ {t.views}</span>}
                    </div>
                  ) : null;
                })()}
                {p.results && (
                  <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-[11px]">
                    {p.results.map((r) => (
                      <span key={r.platform} className={r.ok ? "text-emerald-300/80" : "text-red-300/80"}>
                        {LABEL[r.platform] ?? r.platform}
                        {r.ok && r.url ? (
                          <>
                            {" "}
                            <a href={r.url} target="_blank" rel="noreferrer" className="underline">
                              ↗
                            </a>
                          </>
                        ) : (
                          r.ok ? " ✓" : " ✕"
                        )}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ))
        )}
      </section>
    </div>
  );
}

function CadenceRow({ row, onSave }: { row: ScheduleRow; onSave: (id: string, freq: number) => void }) {
  const [freq, setFreq] = useState(row.frequency);
  const dirty = freq !== row.frequency;
  return (
    <div className="flex items-center gap-3 rounded-2xl border border-white/10 bg-ink-2/70 p-4">
      <div className="min-w-0 flex-1">
        <Link href={`/autopilot/${row.id}`} className="font-medium text-white hover:text-boss-gold">
          {row.name}
        </Link>
        {row.nextRunAt && <div className="text-[11px] text-white/40">Next: {fmt(row.nextRunAt)}</div>}
      </div>
      <div className="flex items-center gap-1.5 text-xs text-white/60">
        <input
          type="number"
          min={1}
          max={21}
          value={freq}
          onChange={(e) => setFreq(Math.min(Math.max(Number(e.target.value) || 1, 1), 21))}
          className="w-14 rounded-lg border border-white/10 bg-black/30 px-2 py-1.5 text-white outline-none focus:border-boss-violet/60"
        />
        <span>×/week</span>
      </div>
      {dirty && (
        <button
          onClick={() => onSave(row.id, freq)}
          className="rounded-lg bg-boss-violet px-3 py-1.5 text-xs font-semibold text-white transition hover:brightness-110"
        >
          Save
        </button>
      )}
    </div>
  );
}
