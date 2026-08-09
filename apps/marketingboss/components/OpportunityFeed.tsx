"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { Opportunity } from "@/lib/opportunities";

const SOURCE_META: Record<string, { emoji: string; label: string }> = {
  trends: { emoji: "🔥", label: "Trends" },
  competitors: { emoji: "🥊", label: "Competitors" },
  performance: { emoji: "📈", label: "Your performance" },
  seasonal: { emoji: "🗓️", label: "Seasonal" },
};

const LEVEL_STYLE: Record<string, string> = {
  high: "bg-red-500/10 text-red-600 border-red-500/30",
  medium: "bg-amber-500/10 text-amber-600 border-amber-500/30",
  low: "bg-slate-100 text-slate-500 border-slate-200",
};

/**
 * The Opportunities feed. Each card explains WHY, shows the scout's value /
 * urgency / confidence estimates, and offers exactly two decisions: act on it
 * (prefills the composer) or dismiss it. The AI recommends; the human decides.
 */
export default function OpportunityFeed({ initial, aiConfigured }: { initial: Opportunity[]; aiConfigured: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [scanning, setScanning] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  async function decide(o: Opportunity, status: "accepted" | "dismissed") {
    if (busy) return;
    setBusy(o.id);
    setNote(null);
    try {
      const res = await fetch(`/api/opportunities/${o.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(data.error || "Couldn't update the opportunity — please try again.");
      }
      if (status === "accepted" && o.recommended_action) {
        const q = new URLSearchParams({
          intent: o.recommended_action.intent,
          type: o.recommended_action.type,
        });
        router.push(`/actions/new?${q.toString()}`);
        return;
      }
      router.refresh();
    } catch (e) {
      setNote(e instanceof Error ? e.message : "Something went wrong — please try again.");
    } finally {
      setBusy(null);
    }
  }

  async function scan() {
    if (scanning) return;
    setScanning(true);
    setNote(null);
    try {
      const res = await fetch("/api/opportunities/discover", { method: "POST" });
      const data = (await res.json().catch(() => ({}))) as { found?: number; error?: string };
      if (!res.ok) throw new Error(data.error || "Discovery failed — please try again.");
      setNote(
        data.found && data.found > 0
          ? `Found ${data.found} new opportunit${data.found === 1 ? "y" : "ies"}.`
          : "Scan complete — nothing new right now. As you publish more and fill in your Brand Kit, discovery gets sharper.",
      );
      router.refresh();
    } catch (e) {
      setNote(e instanceof Error ? e.message : "Discovery failed — please try again.");
    } finally {
      setScanning(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs text-slate-500">
          {initial.length > 0
            ? `${initial.length} open opportunit${initial.length === 1 ? "y" : "ies"}, best first.`
            : "No open opportunities yet."}
        </p>
        <button
          onClick={scan}
          disabled={scanning || !aiConfigured}
          title={aiConfigured ? "Scan trends, competitors, and your results now" : "Needs ANTHROPIC_API_KEY on the server"}
          className="inline-flex items-center gap-2 rounded-xl bg-boss-violet px-4 py-2 text-sm font-semibold text-white transition hover:brightness-110 disabled:opacity-40"
        >
          {scanning && (
            <span className="size-4 animate-spin rounded-full border-2 border-white/30 border-t-white" aria-hidden />
          )}
          {scanning ? "Scanning…" : "Scan now"}
        </button>
      </div>

      {scanning && (
        <p className="rounded-xl border border-boss-violet/20 bg-boss-violet/5 p-3 text-xs text-slate-600">
          Researching live trends in your niche, re-reading competitor angles, checking the calendar for upcoming
          moments, and reviewing your own results — this can take a minute or two.
        </p>
      )}
      {note && <p className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs text-slate-600">{note}</p>}

      {initial.map((o) => {
        const src = SOURCE_META[o.source] ?? { emoji: "🎯", label: o.source };
        return (
          <div key={o.id} className="rounded-2xl border border-slate-200 bg-white p-5">
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <span className="rounded-full bg-slate-100 px-2 py-0.5 font-medium text-slate-700">
                {src.emoji} {src.label}
              </span>
              {o.urgency && (
                <span className={`rounded-full border px-2 py-0.5 font-medium capitalize ${LEVEL_STYLE[o.urgency]}`}>
                  {o.urgency} urgency
                </span>
              )}
              {o.reach && (
                <span className={`rounded-full border px-2 py-0.5 font-medium capitalize ${LEVEL_STYLE[o.reach]}`}>
                  {o.reach} reach
                </span>
              )}
              {typeof o.confidence === "number" && (
                <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 font-medium text-slate-500">
                  {Math.round(o.confidence * 100)}% confidence
                </span>
              )}
            </div>

            <h3 className="mt-2 text-base font-semibold text-slate-900">{o.title}</h3>
            <p className="mt-1 text-sm text-slate-600">{o.description}</p>
            <p className="mt-2 rounded-lg bg-boss-violet/5 px-3 py-2 text-xs leading-relaxed text-slate-600">
              <span className="font-semibold text-boss-violet">Why:</span> {o.reasoning}
            </p>
            {o.business_value && (
              <p className="mt-1.5 text-xs text-slate-500">
                <span className="font-semibold text-slate-600">Potential:</span> {o.business_value}
              </p>
            )}

            <div className="mt-3 flex items-center gap-2">
              <button
                onClick={() => decide(o, "accepted")}
                disabled={busy === o.id}
                className="inline-flex items-center gap-2 rounded-xl bg-boss-gold px-4 py-2 text-sm font-semibold text-black transition hover:brightness-105 disabled:opacity-40"
              >
                {o.recommended_action ? "Act on it →" : "Accept"}
              </button>
              <button
                onClick={() => decide(o, "dismissed")}
                disabled={busy === o.id}
                className="rounded-xl border border-slate-200 px-4 py-2 text-sm text-slate-500 transition hover:text-slate-900 disabled:opacity-40"
              >
                Dismiss
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
