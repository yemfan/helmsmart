"use client";

import { useEffect, useState } from "react";

type Summary = {
  code: string;
  bonusTokens: number;
  completedCount: number;
  pendingCount: number;
  totalBonusEarned: number;
};

/**
 * "Like it? Refer a friend" card.
 *
 * Shows the user's referral link (https://app/?ref=CODE), a copy
 * button, and their running referral stats. When a friend signs up
 * with the code, both users get REFERRAL_BONUS_TOKENS (20,000) in
 * their bonus wallet — which is consumed ahead of the monthly plan
 * quota, so it feels like a real reward, not a cap-filler.
 */
const BONUS_TOKENS_DISPLAY = 20_000;

export function ReferAFriendCard() {
  const [summary, setSummary] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);
  const [shareError, setShareError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/referrals/me");
        const body = (await res.json().catch(() => null)) as
          | ({ ok: true } & Summary)
          | null;
        if (!cancelled && body?.ok) setSummary(body);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (loading || !summary) {
    return (
      <section className="rounded-2xl border border-indigo-100 bg-gradient-to-br from-indigo-50 to-white p-5 shadow-sm">
        <p className="text-xs text-slate-500">Loading your referral link…</p>
      </section>
    );
  }

  const shareUrl =
    typeof window !== "undefined"
      ? `${window.location.origin}/?ref=${summary.code}`
      : `https://www.realtybossai.com/?ref=${summary.code}`;

  async function onCopy() {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      setShareError("Couldn't copy to clipboard — select the text manually.");
    }
  }

  async function onNativeShare() {
    const nav = navigator as Navigator & {
      share?: (data: { title?: string; text?: string; url?: string }) => Promise<void>;
    };
    if (!nav.share) {
      await onCopy();
      return;
    }
    try {
      await nav.share({
        title: "RealtyBoss — 20,000 free AI tokens",
        text: "Try RealtyBoss with me. We both get 20,000 free AI tokens when you sign up.",
        url: shareUrl,
      });
    } catch {
      /* user cancelled — not an error */
    }
  }

  return (
    <section className="overflow-hidden rounded-2xl border border-indigo-100 bg-gradient-to-br from-indigo-50 via-white to-amber-50 shadow-sm">
      <div className="p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="text-xs font-bold uppercase tracking-wide text-indigo-700">
              Like it?
            </div>
            <h2 className="mt-1 text-lg font-bold text-slate-900">
              Refer a friend — get 20,000 free AI tokens
            </h2>
            <p className="mt-1 text-sm text-slate-600">
              You and your friend each get{" "}
              <span className="font-semibold text-indigo-700">
                {BONUS_TOKENS_DISPLAY.toLocaleString()} AI tokens
              </span>{" "}
              when they sign up with your link.
            </p>
          </div>
          {summary.bonusTokens > 0 ? (
            <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-right">
              <div className="text-[11px] font-medium uppercase tracking-wide text-emerald-700">
                Your bonus wallet
              </div>
              <div className="text-lg font-bold text-emerald-900">
                {summary.bonusTokens.toLocaleString()}
              </div>
              <div className="text-[10px] text-emerald-700">tokens available</div>
            </div>
          ) : null}
        </div>

        <div className="mt-4 flex items-stretch gap-2">
          <div className="flex-1 overflow-hidden rounded-lg border border-slate-200 bg-white px-3 py-2.5 font-mono text-xs text-slate-700">
            <div className="truncate">{shareUrl}</div>
          </div>
          <button
            type="button"
            onClick={() => void onCopy()}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-slate-900 px-3 py-2 text-xs font-semibold text-white hover:bg-slate-800"
          >
            {copied ? (
              <>
                <span aria-hidden>✓</span> Copied
              </>
            ) : (
              <>
                <svg
                  className="h-3.5 w-3.5"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                  <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                </svg>
                Copy link
              </>
            )}
          </button>
          <button
            type="button"
            onClick={() => void onNativeShare()}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
          >
            <svg
              className="h-3.5 w-3.5"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
            >
              <circle cx="18" cy="5" r="3" />
              <circle cx="6" cy="12" r="3" />
              <circle cx="18" cy="19" r="3" />
              <line x1="8.59" y1="13.51" x2="15.42" y2="17.49" />
              <line x1="15.41" y1="6.51" x2="8.59" y2="10.49" />
            </svg>
            Share
          </button>
        </div>
        {shareError ? (
          <p className="mt-2 text-xs text-red-600">{shareError}</p>
        ) : null}

        {summary.completedCount > 0 || summary.pendingCount > 0 ? (
          <div className="mt-4 flex flex-wrap gap-2 text-[11px]">
            {summary.completedCount > 0 ? (
              <span className="rounded-full bg-emerald-100 px-2.5 py-0.5 font-medium text-emerald-800">
                {summary.completedCount} signed up · earned{" "}
                {summary.totalBonusEarned.toLocaleString()} tokens
              </span>
            ) : null}
            {summary.pendingCount > 0 ? (
              <span className="rounded-full bg-amber-100 px-2.5 py-0.5 font-medium text-amber-800">
                {summary.pendingCount} pending
              </span>
            ) : null}
          </div>
        ) : (
          <p className="mt-3 text-[11px] text-slate-500">
            Your code: <span className="font-mono font-semibold">{summary.code}</span>
          </p>
        )}
      </div>
    </section>
  );
}
