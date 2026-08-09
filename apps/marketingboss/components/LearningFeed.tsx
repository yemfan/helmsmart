"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { Learning } from "@/lib/learnings";

type Evidence = {
  winner?: { key: string; posts: number; totalEngagement: number; avg: number };
  runnerUp?: { key: string; posts: number; totalEngagement: number; avg: number };
};

export type PlaybookOption = { id: string; name: string };

/**
 * Narrative learnings: insight → evidence → recommendation → Apply. Applying
 * points the learning at a playbook; the planner folds it into every future
 * batch it plans there.
 */
export default function LearningFeed({
  learnings,
  playbooks,
}: {
  learnings: Learning[];
  playbooks: PlaybookOption[];
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [synthesizing, setSynthesizing] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [target, setTarget] = useState<Record<string, string>>({});

  async function synthesize() {
    if (synthesizing) return;
    setSynthesizing(true);
    setNote(null);
    try {
      const res = await fetch("/api/learnings/synthesize", { method: "POST" });
      const data = (await res.json().catch(() => ({}))) as { created?: number; error?: string };
      if (!res.ok) throw new Error(data.error || "Synthesis failed — please try again.");
      setNote(
        data.created && data.created > 0
          ? `Found ${data.created} new learning${data.created === 1 ? "" : "s"}.`
          : "No new patterns yet — learnings appear once cohorts reach 3+ posts with a clear winner. Keep publishing.",
      );
      router.refresh();
    } catch (e) {
      setNote(e instanceof Error ? e.message : "Synthesis failed — please try again.");
    } finally {
      setSynthesizing(false);
    }
  }

  async function apply(l: Learning) {
    if (busy) return;
    setBusy(l.id);
    setNote(null);
    try {
      const campaignId = target[l.id] || playbooks[0]?.id || null;
      const res = await fetch(`/api/learnings/${l.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ campaignId }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(data.error || "Apply failed — please try again.");
      }
      router.refresh();
    } catch (e) {
      setNote(e instanceof Error ? e.message : "Apply failed — please try again.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-sm font-semibold text-slate-900">What we've learned</h3>
        <button
          onClick={synthesize}
          disabled={synthesizing}
          className="inline-flex items-center gap-2 rounded-xl bg-boss-violet px-4 py-2 text-sm font-semibold text-white transition hover:brightness-110 disabled:opacity-40"
        >
          {synthesizing && (
            <span className="size-4 animate-spin rounded-full border-2 border-white/30 border-t-white" aria-hidden />
          )}
          {synthesizing ? "Analyzing…" : "Analyze results"}
        </button>
      </div>

      {note && <p className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs text-slate-600">{note}</p>}

      {learnings.length === 0 ? (
        <p className="rounded-2xl border border-slate-200 bg-white p-4 text-sm text-slate-500">
          No learnings yet. They're synthesized from your own engagement data — deliberately conservative: a pattern
          needs 3+ posts per side and a clear winner before it shows up here.
        </p>
      ) : (
        learnings.map((l) => {
          const ev = (l.evidence ?? {}) as Evidence;
          return (
            <div key={l.id} className="rounded-2xl border border-slate-200 bg-white p-5">
              <p className="text-sm font-semibold text-slate-900">{l.insight}</p>
              {ev.winner && ev.runnerUp && (
                <p className="mt-1 text-xs text-slate-500">
                  Evidence: “{ev.winner.key}” averaged {ev.winner.avg} engagement across {ev.winner.posts} posts vs “
                  {ev.runnerUp.key}” at {ev.runnerUp.avg} across {ev.runnerUp.posts}.
                </p>
              )}
              <p className="mt-2 rounded-lg bg-boss-violet/5 px-3 py-2 text-xs leading-relaxed text-slate-600">
                <span className="font-semibold text-boss-violet">Recommendation:</span> {l.recommendation}
              </p>

              <div className="mt-3 flex flex-wrap items-center gap-2">
                {l.applied_at ? (
                  <span className="rounded-full bg-emerald-500/15 px-2.5 py-1 text-xs font-semibold text-emerald-600">
                    ✓ Applied{l.campaign_id ? " to a playbook" : ""} — the planner uses this now
                  </span>
                ) : (
                  <>
                    {playbooks.length > 1 && (
                      <select
                        value={target[l.id] ?? playbooks[0]?.id ?? ""}
                        onChange={(e) => setTarget((t) => ({ ...t, [l.id]: e.target.value }))}
                        className="rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs text-slate-700 outline-none focus:border-boss-violet/60"
                      >
                        {playbooks.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.name}
                          </option>
                        ))}
                      </select>
                    )}
                    <button
                      onClick={() => apply(l)}
                      disabled={busy === l.id}
                      className="rounded-xl bg-boss-gold px-4 py-2 text-sm font-semibold text-black transition hover:brightness-105 disabled:opacity-40"
                    >
                      {playbooks.length > 0 ? "Apply to playbook" : "Apply account-wide"}
                    </button>
                  </>
                )}
              </div>
            </div>
          );
        })
      )}
    </div>
  );
}
