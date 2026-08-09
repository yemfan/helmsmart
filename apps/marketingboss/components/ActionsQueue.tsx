"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

export type ScheduleRow = { id: string; name: string; frequency: number; nextRunAt: string | null };

type Metric = { likes?: number; comments?: number; views?: number };
export type QueuePost = {
  id: string;
  campaign_id: string | null;
  status: string;
  type: "text" | "image" | "video";
  angle: string | null;
  title: string | null;
  caption: string | null;
  media_url: string | null;
  channels: string[];
  metrics: Record<string, Metric> | null;
  scheduled_for: string | null;
  published_at: string | null;
  created_at: string;
};

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

/**
 * The Actions queue — what's waiting for approval, what's scheduled, and the
 * standing cadences producing new actions. Every action shows its state, like
 * a PR list: you always know what's happening and what needs you.
 */
export default function ActionsQueue({
  cadences,
  drafts,
  scheduled,
}: {
  cadences: ScheduleRow[];
  drafts: QueuePost[];
  scheduled: QueuePost[];
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
      {/* New action */}
      <div className="relative flex justify-end" ref={menuRef}>
        <button
          onClick={() => setMenuOpen((o) => !o)}
          className="inline-flex items-center gap-2 rounded-xl bg-boss-gold px-5 py-2.5 text-sm font-semibold text-black transition hover:brightness-105"
        >
          + New action
          <span className="text-[10px] opacity-70">▼</span>
        </button>
        {menuOpen && (
          <div className="absolute right-0 top-full z-50 mt-2 w-64 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-2xl">
            <Link href="/actions/new" className="block px-4 py-3 transition hover:bg-slate-100">
              <div className="text-sm font-semibold text-slate-900">✨ AI post</div>
              <div className="text-[11px] text-slate-500">Write one post now, or schedule it.</div>
            </Link>
            <Link href="/actions/ugc" className="block border-t border-slate-200 px-4 py-3 transition hover:bg-slate-100">
              <div className="text-sm font-semibold text-slate-900">🎥 UGC ad</div>
              <div className="text-[11px] text-slate-500">AI films a creator-style video ad (with voice).</div>
            </Link>
            <Link href="/playbooks" className="block border-t border-slate-200 px-4 py-3 transition hover:bg-slate-100">
              <div className="text-sm font-semibold text-slate-900">📚 Playbook</div>
              <div className="text-[11px] text-slate-500">A strategy that plans actions for you, on cadence.</div>
            </Link>
          </div>
        )}
      </div>

      {/* Waiting approval */}
      {drafts.length > 0 && (
        <section className="flex flex-col gap-2">
          <h3 className="text-sm font-semibold text-slate-900">Waiting approval ({drafts.length})</h3>
          {drafts.map((p) => (
            <Link
              key={p.id}
              href={p.campaign_id ? `/playbooks/${p.campaign_id}` : "/actions"}
              className="flex items-start gap-3 rounded-2xl border border-slate-200 bg-white p-4 transition hover:border-boss-violet/40"
            >
              {p.media_url && p.type !== "video" && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={p.media_url} alt="" className="size-14 shrink-0 rounded-lg object-cover" />
              )}
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  <span className="rounded-full bg-amber-500/15 px-2 py-0.5 font-semibold text-amber-600">
                    Waiting approval
                  </span>
                  <span className="text-slate-500">
                    {TYPE_EMOJI[p.type]}
                    {p.angle ? ` ${p.angle}` : ""}
                  </span>
                </div>
                <p className="mt-1 line-clamp-2 text-sm text-slate-700">{p.title || p.caption}</p>
              </div>
              <span className="shrink-0 self-center text-xs font-medium text-boss-gold">Review →</span>
            </Link>
          ))}
        </section>
      )}

      {/* Scheduled */}
      <section className="flex flex-col gap-2">
        <h3 className="text-sm font-semibold text-slate-900">Scheduled ({scheduled.length})</h3>
        {scheduled.length === 0 ? (
          <p className="rounded-2xl border border-slate-200 bg-white p-4 text-sm text-slate-500">
            Nothing scheduled yet.
          </p>
        ) : (
          scheduled.map((p) => (
            <div key={p.id} className="flex items-start gap-3 rounded-2xl border border-slate-200 bg-white p-4">
              {p.media_url && p.type !== "video" && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={p.media_url} alt="" className="size-14 shrink-0 rounded-lg object-cover" />
              )}
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  <span className="rounded-full bg-boss-violet/20 px-2 py-0.5 font-semibold text-boss-violet">
                    {fmt(p.scheduled_for)}
                  </span>
                  <span className="text-slate-500">
                    {TYPE_EMOJI[p.type]} {p.channels.map((c) => LABEL[c] ?? c).join(", ")}
                  </span>
                </div>
                <p className="mt-1 line-clamp-2 text-sm text-slate-700">{p.caption}</p>
              </div>
              <button
                onClick={() => cancel(p.id)}
                disabled={busy === p.id}
                className="shrink-0 rounded-lg border border-slate-200 px-3 py-1.5 text-xs text-slate-500 transition hover:text-slate-900 disabled:opacity-40"
              >
                Cancel
              </button>
            </div>
          ))
        )}
      </section>

      {/* Standing cadences (playbook schedules) */}
      <section className="flex flex-col gap-2">
        <h3 className="text-sm font-semibold text-slate-900">Playbook cadences</h3>
        {cadences.length === 0 ? (
          <p className="rounded-2xl border border-slate-200 bg-white p-4 text-sm text-slate-500">
            No playbooks producing actions yet.{" "}
            <Link href="/playbooks" className="text-boss-gold underline underline-offset-2">
              Start one →
            </Link>
          </p>
        ) : (
          cadences.map((c) => <CadenceRow key={c.id} row={c} onSave={saveFreq} />)
        )}
      </section>
    </div>
  );
}

function CadenceRow({ row, onSave }: { row: ScheduleRow; onSave: (id: string, freq: number) => void }) {
  const [freq, setFreq] = useState(row.frequency);
  const dirty = freq !== row.frequency;
  return (
    <div className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white p-4">
      <div className="min-w-0 flex-1">
        <Link href={`/playbooks/${row.id}`} className="font-medium text-slate-900 hover:text-boss-gold">
          {row.name}
        </Link>
        {row.nextRunAt && <div className="text-[11px] text-slate-400">Next: {fmt(row.nextRunAt)}</div>}
      </div>
      <div className="flex items-center gap-1.5 text-xs text-slate-600">
        <input
          type="number"
          min={1}
          max={21}
          value={freq}
          onChange={(e) => setFreq(Math.min(Math.max(Number(e.target.value) || 1, 1), 21))}
          className="w-14 rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-slate-900 outline-none focus:border-boss-violet/60"
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
