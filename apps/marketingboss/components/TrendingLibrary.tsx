"use client";

import { useState } from "react";
import Link from "next/link";
import type { Remix, ScoreComponents, ViralItem, ViralTemplate } from "@/lib/viralIntelligence";

type Item = ViralItem & { template: ViralTemplate | null };

const VELOCITY_META: Record<string, { label: string; cls: string }> = {
  exploding: { label: "🔥 EXPLODING", cls: "bg-red-500/15 text-red-600" },
  rising: { label: "📈 RISING", cls: "bg-amber-500/15 text-amber-600" },
  emerging: { label: "🌱 EMERGING", cls: "bg-emerald-500/15 text-emerald-600" },
  viral: { label: "⚡ VIRAL", cls: "bg-boss-violet/15 text-boss-violet" },
  established: { label: "ESTABLISHED", cls: "bg-slate-100 text-slate-500" },
  declining: { label: "DECLINING", cls: "bg-slate-100 text-slate-400" },
  evergreen: { label: "🌲 EVERGREEN", cls: "bg-emerald-500/10 text-emerald-700" },
};

const COMPONENT_LABEL: Record<keyof ScoreComponents, string> = {
  momentum: "Momentum",
  engagement: "Engagement",
  acceleration: "Acceleration",
  recency: "Recency",
  replicability: "Replicability",
  industryFit: "Industry fit",
  crossPlatform: "Cross-platform",
};

/**
 * 🔥 Trending now — the shared viral library. Every card explains why it
 * works; the primary CTA is Remix (an ORIGINAL version for this business),
 * never Copy.
 */
export type PresenterOption = { id: string; name: string; role: string | null };

export default function TrendingLibrary({
  initial,
  presenters = [],
}: {
  initial: Item[];
  /** The user's cast (Character Studio) — remixes are written in the chosen persona. */
  presenters?: PresenterOption[];
}) {
  const [items, setItems] = useState<Item[]>(initial);
  const [presenter, setPresenter] = useState<string>("");
  const [q, setQ] = useState("");
  const [searching, setSearching] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [openScore, setOpenScore] = useState<string | null>(null);
  const [remixing, setRemixing] = useState<string | null>(null);
  const [remixes, setRemixes] = useState<Record<string, Remix>>({});

  async function search() {
    if (searching) return;
    setSearching(true);
    setNote(null);
    try {
      const res = await fetch(`/api/viral/search?q=${encodeURIComponent(q.trim())}`);
      const b = (await res.json().catch(() => null)) as { ok?: boolean; items?: Item[]; error?: string } | null;
      if (!res.ok || !b?.items) throw new Error(b?.error || "Search failed — please try again.");
      setItems(b.items);
      if (b.items.length === 0) setNote("No matches — try different words, or clear the search.");
    } catch (e) {
      setNote(e instanceof Error ? e.message : "Search failed — please try again.");
    } finally {
      setSearching(false);
    }
  }

  async function remix(item: Item) {
    if (remixing) return;
    setRemixing(item.id);
    setNote(null);
    try {
      const res = await fetch(`/api/viral/${item.id}/remix`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ characterId: presenter || null }),
      });
      const b = (await res.json().catch(() => null)) as { ok?: boolean; remix?: Remix; error?: string } | null;
      if (!res.ok || !b?.remix) throw new Error(b?.error || "Remix failed — please try again.");
      setRemixes((cur) => ({ ...cur, [item.id]: b.remix! }));
    } catch (e) {
      setNote(e instanceof Error ? e.message : "Remix failed — please try again.");
    } finally {
      setRemixing(null);
    }
  }

  if (initial.length === 0) return null;

  return (
    <section className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-slate-900">🔥 Trending now</h3>
        <div className="flex items-center gap-1.5">
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && void search()}
            placeholder="Search trends…"
            className="w-44 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-900 outline-none focus:border-boss-violet/60"
          />
          <button
            onClick={() => void search()}
            disabled={searching}
            className="rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs text-slate-600 transition hover:text-slate-900 disabled:opacity-40"
          >
            {searching ? "…" : "Search"}
          </button>
        </div>
      </div>
      <p className="-mt-1 text-xs text-slate-500">
        What&apos;s gaining momentum across social right now, refreshed daily. Remix makes an{" "}
        <em>original</em> version for your business — never a copy.
      </p>

      {presenters.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className="font-medium text-slate-600">🎭 Presenter</span>
          <select
            value={presenter}
            onChange={(e) => setPresenter(e.target.value)}
            className="rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs text-slate-700 outline-none focus:border-boss-violet/60"
          >
            <option value="">No character</option>
            {presenters.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
                {p.role ? ` — ${p.role}` : ""}
              </option>
            ))}
          </select>
          <span className="text-slate-400">remixes are written in your character&apos;s voice and look</span>
        </div>
      )}

      {note && <p className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs text-slate-600">{note}</p>}

      {items.map((it) => {
        const vel = VELOCITY_META[it.velocity ?? ""] ?? { label: (it.velocity ?? "trend").toUpperCase(), cls: "bg-slate-100 text-slate-500" };
        const rx = remixes[it.id];
        return (
          <div key={it.id} className="rounded-2xl border border-slate-200 bg-white p-5">
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <span className={`rounded-full px-2 py-0.5 font-semibold ${vel.cls}`}>{vel.label}</span>
              <button
                onClick={() => setOpenScore((cur) => (cur === it.id ? null : it.id))}
                title="See why this score"
                className="rounded-full border border-boss-gold/30 bg-boss-gold/10 px-2 py-0.5 font-semibold text-boss-gold"
              >
                Viral score {Math.round(Number(it.viral_score))} ▾
              </button>
              {it.format && <span className="rounded-full bg-slate-100 px-2 py-0.5 capitalize text-slate-600">{it.format.replaceAll("_", " ")}</span>}
              {it.platform && <span className="rounded-full bg-slate-100 px-2 py-0.5 capitalize text-slate-600">{it.platform}</span>}
              {it.template && (
                <span className="rounded-full bg-boss-violet/10 px-2 py-0.5 font-medium text-boss-violet">Template ready</span>
              )}
            </div>

            {openScore === it.id && it.score_components && (
              <div className="mt-2 grid grid-cols-2 gap-x-6 gap-y-0.5 rounded-lg bg-slate-50 p-2.5 text-[11px] text-slate-600 sm:grid-cols-4">
                {(Object.keys(COMPONENT_LABEL) as (keyof ScoreComponents)[]).map((k) =>
                  typeof it.score_components?.[k] === "number" ? (
                    <div key={k} className="flex justify-between gap-2">
                      <span>{COMPONENT_LABEL[k]}</span>
                      <span className="font-semibold text-slate-900">{Math.round(it.score_components[k]!)}</span>
                    </div>
                  ) : null,
                )}
              </div>
            )}

            <h4 className="mt-2 text-base font-semibold text-slate-900">{it.title}</h4>
            {it.description && <p className="mt-1 text-sm text-slate-600">{it.description}</p>}
            {typeof it.metrics?.note === "string" && (
              <p className="mt-1 text-[11px] text-slate-400">{String(it.metrics.note)}{it.metrics?.estimated ? " (estimated from public research)" : ""}</p>
            )}

            {(it.analysis?.whyItWorks?.length ?? 0) > 0 && (
              <div className="mt-2 rounded-lg bg-boss-violet/5 px-3 py-2 text-xs leading-relaxed text-slate-600">
                <span className="font-semibold text-boss-violet">Why it works:</span>
                <ul className="mt-0.5 list-disc pl-4">
                  {it.analysis!.whyItWorks!.slice(0, 4).map((w, i) => (
                    <li key={i}>{w}</li>
                  ))}
                </ul>
              </div>
            )}

            {rx ? (
              <div className="mt-3 rounded-xl border border-boss-gold/30 bg-boss-gold/5 p-3.5">
                <div className="text-xs font-semibold uppercase tracking-wide text-boss-gold">Your version</div>
                <p className="mt-1 text-sm font-semibold text-slate-900">{rx.hook}</p>
                <ul className="mt-1.5 list-disc pl-4 text-xs text-slate-600">
                  {rx.outline.slice(0, 6).map((o, i) => (
                    <li key={i}>{o}</li>
                  ))}
                </ul>
                <p className="mt-1.5 text-xs text-slate-500">{rx.caption}</p>
                <div className="mt-2.5 flex items-center gap-2">
                  <Link
                    href={`/actions/new?intent=${encodeURIComponent(rx.intent)}&type=${rx.suggestedType}`}
                    className="rounded-xl bg-boss-gold px-4 py-2 text-sm font-semibold text-black transition hover:brightness-105"
                  >
                    Create content →
                  </Link>
                  <span className="text-[11px] text-slate-400 capitalize">{rx.suggestedType} · opens prefilled in the composer</span>
                </div>
              </div>
            ) : (
              <div className="mt-3 flex items-center gap-2">
                <button
                  onClick={() => void remix(it)}
                  disabled={remixing === it.id}
                  className="inline-flex items-center gap-2 rounded-xl bg-boss-gold px-4 py-2 text-sm font-semibold text-black transition hover:brightness-105 disabled:opacity-40"
                >
                  {remixing === it.id && (
                    <span className="size-4 animate-spin rounded-full border-2 border-black/30 border-t-black" aria-hidden />
                  )}
                  {remixing === it.id ? "Writing your version…" : "Remix for my business"}
                </button>
                {it.url && (
                  <a href={it.url} target="_blank" rel="noreferrer" className="text-xs text-slate-400 underline hover:text-slate-700">
                    source ↗
                  </a>
                )}
              </div>
            )}
          </div>
        );
      })}
    </section>
  );
}
