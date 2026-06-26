"use client";

import { useState } from "react";
import type {
  OverallReaction,
  PriceFeedback,
} from "@/lib/listing-feedback/types";
import type { PublicFeedbackInfo } from "@/lib/listing-feedback/publicService";

const REACTION_CONFIG: Array<{
  value: OverallReaction;
  label: string;
  emoji: string;
}> = [
  { value: "love", label: "Love it", emoji: "❤️" },
  { value: "like", label: "Like it", emoji: "👍" },
  { value: "maybe", label: "Maybe", emoji: "🤔" },
  { value: "pass", label: "Pass", emoji: "👎" },
];

export function FeedbackFormClient({ info }: { info: PublicFeedbackInfo }) {
  const alreadySubmitted = info.alreadySubmitted;

  const [rating, setRating] = useState<number | null>(null);
  const [reaction, setReaction] = useState<OverallReaction | null>(null);
  const [pros, setPros] = useState("");
  const [cons, setCons] = useState("");
  const [priceFeedback, setPriceFeedback] = useState<PriceFeedback | "">("");
  const [wouldOffer, setWouldOffer] = useState<boolean | null>(null);
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setError(null);
    setSubmitting(true);
    try {
      const res = await fetch(`/api/public/listing-feedback/${info.slug}/submit`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          rating,
          overallReaction: reaction,
          pros: pros.trim() || null,
          cons: cons.trim() || null,
          priceFeedback: priceFeedback || null,
          wouldOffer,
          notes: notes.trim() || null,
        }),
      });
      const body = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
      };
      if (!res.ok || !body.ok) {
        setError(body.error ?? "Submit failed.");
        return;
      }
      setSubmitted(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Network error.");
    } finally {
      setSubmitting(false);
    }
  }

  const locationLine = [info.city, info.state].filter(Boolean).join(", ");
  const hostLine = info.listingAgentName
    ? `Requested by ${info.listingAgentName}${info.brokerage ? ` · ${info.brokerage}` : ""}`
    : null;

  if (alreadySubmitted || submitted) {
    return (
      <div className="min-h-screen bg-slate-50 px-4 py-10">
        <div className="mx-auto max-w-md rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm">
          <div className="text-5xl">✅</div>
          <h1 className="mt-3 text-xl font-semibold text-slate-900">
            {alreadySubmitted && !submitted
              ? "Feedback already submitted"
              : "Thanks!"}
          </h1>
          <p className="mt-2 text-sm text-slate-600">
            {alreadySubmitted && !submitted
              ? "Looks like this form was filled out already. Your earlier response is with the listing agent."
              : "Your feedback has been shared with the listing agent."}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 px-4 py-6">
      <div className="mx-auto max-w-md space-y-5">
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="text-[11px] font-semibold uppercase tracking-wide text-blue-600">
            Showing feedback
          </div>
          <h1 className="mt-1 text-xl font-semibold text-slate-900">
            {info.propertyAddress}
          </h1>
          {locationLine ? (
            <div className="text-sm text-slate-600">{locationLine}</div>
          ) : null}
          {info.showingDate ? (
            <div className="mt-1 text-xs text-slate-500">
              Showing: {new Date(info.showingDate + "T00:00:00Z").toLocaleDateString(undefined, {
                month: "short",
                day: "numeric",
                year: "numeric",
                timeZone: "UTC",
              })}
            </div>
          ) : null}
          {hostLine ? <p className="mt-2 text-xs text-slate-500">{hostLine}</p> : null}
          {info.buyerAgentName ? (
            <p className="mt-1 text-xs text-slate-500">
              Hi {info.buyerAgentName} — 30-second form, all fields optional.
            </p>
          ) : null}
        </div>

        <div className="space-y-5 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div>
            <label className="block text-sm font-medium text-slate-700">
              How did your buyer feel about it?
            </label>
            <div className="mt-2 grid grid-cols-2 gap-2">
              {REACTION_CONFIG.map((r) => (
                <button
                  key={r.value}
                  type="button"
                  onClick={() => setReaction(reaction === r.value ? null : r.value)}
                  className={`rounded-xl border px-3 py-3 text-base font-medium ${
                    reaction === r.value
                      ? "border-slate-900 bg-slate-900 text-white"
                      : "border-slate-200 bg-white text-slate-700"
                  }`}
                >
                  <span className="mr-1">{r.emoji}</span>
                  {r.label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700">Rating</label>
            <div className="mt-1 flex items-center gap-1">
              {[1, 2, 3, 4, 5].map((n) => {
                const active = (rating ?? 0) >= n;
                return (
                  <button
                    key={n}
                    type="button"
                    onClick={() => setRating(rating === n ? null : n)}
                    className={`h-10 w-10 rounded-full text-2xl ${active ? "text-amber-500" : "text-slate-300"} hover:text-amber-500`}
                    aria-label={`${n} stars`}
                  >
                    ★
                  </button>
                );
              })}
              {rating ? (
                <button
                  type="button"
                  onClick={() => setRating(null)}
                  className="ml-2 text-xs text-slate-500 hover:underline"
                >
                  Clear
                </button>
              ) : null}
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700">
              What worked
            </label>
            <textarea
              value={pros}
              onChange={(e) => setPros(e.target.value)}
              rows={2}
              placeholder="Natural light, location, floor plan…"
              className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-base"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700">Concerns</label>
            <textarea
              value={cons}
              onChange={(e) => setCons(e.target.value)}
              rows={2}
              placeholder="Kitchen size, parking, traffic noise…"
              className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-base"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700">
              Price reaction
            </label>
            <select
              value={priceFeedback}
              onChange={(e) => setPriceFeedback(e.target.value as PriceFeedback | "")}
              className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-3 text-base"
            >
              <option value="">—</option>
              <option value="too_high">Too high</option>
              <option value="about_right">About right</option>
              <option value="bargain">Priced to sell / bargain</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700">
              Considering an offer?
            </label>
            <div className="mt-2 grid grid-cols-3 gap-2">
              {[
                { value: true, label: "Yes" },
                { value: null, label: "Maybe" },
                { value: false, label: "No" },
              ].map((opt, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => setWouldOffer(opt.value)}
                  className={`rounded-xl border px-3 py-2 text-sm font-medium ${
                    wouldOffer === opt.value
                      ? "border-slate-900 bg-slate-900 text-white"
                      : "border-slate-200 bg-white text-slate-700"
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700">
              Anything else to pass on
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-base"
            />
          </div>

          {error ? (
            <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
              {error}
            </div>
          ) : null}

          <button
            type="button"
            onClick={() => void submit()}
            disabled={submitting}
            className="w-full rounded-xl bg-slate-900 px-6 py-4 text-lg font-semibold text-white hover:bg-slate-800 disabled:opacity-50"
          >
            {submitting ? "Sharing…" : "Share feedback"}
          </button>

          <p className="text-center text-[11px] text-slate-400">
            Powered by RealtyBoss
          </p>
        </div>
      </div>
    </div>
  );
}
