"use client";

import { useState } from "react";
import { Copy, Check, Sparkles, Loader2, ThumbsUp, X } from "lucide-react";

/**
 * "This week's social posts" — the Marketing Assistant's weekly social queue.
 *
 * Phase 1 (drafts + queue, no real posting): shows AI-recommended post drafts
 * (1 timely from the newsletter + 2 evergreen from the shared library). An
 * autopilot toggle (Approve each ↔ Autopilot) sets the mode; "Generate this
 * week's posts" builds the queue on demand; each card can be Copied (caption +
 * hashtags + link to clipboard), Approved, or Dismissed.
 *
 * Styling matches the sibling cards on the Marketing Assistant page (rounded-xl
 * border, white bg, soft shadow).
 */

export type SocialRec = {
  id: string;
  week_of: string;
  source_type: "evergreen" | "timely";
  caption: string;
  hashtags: string[];
  link: string | null;
  image_prompt: string | null;
  status: "suggested" | "approved" | "dismissed" | "copied";
};

function clipboardText(rec: SocialRec): string {
  const tags = rec.hashtags?.length ? rec.hashtags.join(" ") : "";
  return [rec.caption, tags, rec.link ?? ""].filter(Boolean).join("\n\n");
}

export default function WeeklySocialPosts({
  initialRecs,
  initialMode,
  weekOf,
}: {
  initialRecs: SocialRec[];
  initialMode: "ask" | "auto";
  weekOf: string;
}) {
  const [recs, setRecs] = useState<SocialRec[]>(initialRecs);
  const [mode, setMode] = useState<"ask" | "auto">(initialMode);
  const [generating, setGenerating] = useState(false);
  const [savingMode, setSavingMode] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Hide dismissed cards from the list.
  const visible = recs.filter((r) => r.status !== "dismissed");

  async function generate() {
    setGenerating(true);
    setError(null);
    try {
      const res = await fetch("/api/social/recommend", { method: "POST" });
      const json = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        recommendations?: SocialRec[];
        error?: string;
      };
      if (!res.ok || !json.ok) {
        setError(json.error || "Could not generate posts.");
        return;
      }
      if (Array.isArray(json.recommendations)) setRecs(json.recommendations);
    } catch {
      setError("Could not generate posts.");
    } finally {
      setGenerating(false);
    }
  }

  async function toggleMode() {
    const next = mode === "auto" ? "ask" : "auto";
    setSavingMode(true);
    setError(null);
    // Optimistic.
    setMode(next);
    try {
      const res = await fetch("/api/social/mode", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: next }),
      });
      const json = (await res.json().catch(() => ({}))) as { ok?: boolean };
      if (!res.ok || !json.ok) {
        setMode(mode); // revert
        setError("Could not update autopilot setting.");
      }
    } catch {
      setMode(mode);
      setError("Could not update autopilot setting.");
    } finally {
      setSavingMode(false);
    }
  }

  async function setStatus(id: string, status: SocialRec["status"]) {
    // Optimistic update.
    setRecs((prev) => prev.map((r) => (r.id === id ? { ...r, status } : r)));
    try {
      await fetch(`/api/social/recommendation/${id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
    } catch {
      // Non-fatal; the queue re-syncs on next load.
    }
  }

  async function copy(rec: SocialRec) {
    try {
      await navigator.clipboard.writeText(clipboardText(rec));
      setCopiedId(rec.id);
      setTimeout(() => setCopiedId((c) => (c === rec.id ? null : c)), 1800);
      if (rec.status !== "approved") setStatus(rec.id, "copied");
    } catch {
      setError("Clipboard not available.");
    }
  }

  return (
    <section className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold text-gray-900">This week&apos;s social posts</h2>
          <p className="text-xs text-gray-500">
            AI-drafted for you — copy to your socials. Nothing posts automatically.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {/* Autopilot toggle */}
          <button
            type="button"
            onClick={toggleMode}
            disabled={savingMode}
            className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-xs font-medium text-gray-700 shadow-sm hover:bg-gray-50 disabled:opacity-60"
            aria-pressed={mode === "auto"}
            title={
              mode === "auto"
                ? "Autopilot: new posts are auto-approved into your queue."
                : "Approve each: new posts wait for your approval."
            }
          >
            <span
              className={`inline-block h-2 w-2 rounded-full ${
                mode === "auto" ? "bg-emerald-500" : "bg-gray-300"
              }`}
            />
            {mode === "auto" ? "Autopilot" : "Approve each"}
          </button>

          {/* Generate */}
          <button
            type="button"
            onClick={generate}
            disabled={generating}
            className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-medium text-white shadow-sm hover:bg-blue-700 disabled:opacity-60"
          >
            {generating ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Sparkles className="h-3.5 w-3.5" />
            )}
            {generating ? "Generating…" : "Generate this week's posts"}
          </button>
        </div>
      </div>

      {error && (
        <p className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">{error}</p>
      )}

      {visible.length === 0 ? (
        <p className="py-6 text-center text-sm text-gray-400">
          No posts yet — Generate this week&apos;s posts.
        </p>
      ) : (
        <ul className="space-y-3">
          {visible.map((rec) => (
            <li key={rec.id} className="rounded-lg border border-gray-100 p-3">
              <div className="mb-2 flex items-center gap-2">
                <span
                  className={`rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide ${
                    rec.source_type === "timely"
                      ? "bg-amber-100 text-amber-700"
                      : "bg-indigo-100 text-indigo-700"
                  }`}
                >
                  {rec.source_type === "timely" ? "Timely" : "Evergreen"}
                </span>
                {rec.status === "approved" && (
                  <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-medium text-emerald-700">
                    Ready to post
                  </span>
                )}
                {rec.status === "copied" && (
                  <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-medium text-gray-600">
                    Copied
                  </span>
                )}
              </div>

              <p className="whitespace-pre-line text-sm text-gray-900">{rec.caption}</p>

              {rec.hashtags?.length > 0 && (
                <p className="mt-2 text-xs text-blue-600">{rec.hashtags.join(" ")}</p>
              )}

              {rec.link && (
                <a
                  href={rec.link}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-1 block truncate text-xs text-gray-500 underline-offset-2 hover:underline"
                >
                  {rec.link}
                </a>
              )}

              {rec.image_prompt && (
                <p className="mt-2 text-xs text-gray-400">
                  <span className="font-medium text-gray-500">Image idea:</span> {rec.image_prompt}
                </p>
              )}

              <div className="mt-3 flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => copy(rec)}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-2.5 py-1 text-xs font-medium text-gray-700 hover:bg-gray-50"
                >
                  {copiedId === rec.id ? (
                    <Check className="h-3.5 w-3.5 text-emerald-600" />
                  ) : (
                    <Copy className="h-3.5 w-3.5" />
                  )}
                  {copiedId === rec.id ? "Copied" : "Copy"}
                </button>

                {rec.status !== "approved" && (
                  <button
                    type="button"
                    onClick={() => setStatus(rec.id, "approved")}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700 hover:bg-emerald-100"
                  >
                    <ThumbsUp className="h-3.5 w-3.5" />
                    Approve
                  </button>
                )}

                <button
                  type="button"
                  onClick={() => setStatus(rec.id, "dismissed")}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-2.5 py-1 text-xs font-medium text-gray-500 hover:bg-gray-50"
                >
                  <X className="h-3.5 w-3.5" />
                  Dismiss
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <p className="mt-3 text-[11px] text-gray-400">Week of {weekOf}</p>
    </section>
  );
}
