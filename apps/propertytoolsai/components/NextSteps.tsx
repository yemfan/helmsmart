"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import Link from "next/link";
import { readBehaviorEvents } from "@/lib/behaviorStore";
import { buildUserProfile } from "@/lib/userProfile";
import { getNextBestActions, type RecommendedAction } from "@/lib/recommendation";
import { trackEvent } from "@/lib/tracking";

export default function NextSteps() {
  const pathname = usePathname();
  const [allActions, setAllActions] = useState<RecommendedAction[]>([]);
  /*
   * Never recommend the page they are standing on.
   *
   * The picks come from behaviour, so the tool someone just used scores high —
   * which is how a visitor reading their home-value report would be offered
   * "Home Value Estimator" as a next step. Filtering here rather than inside
   * getNextBestActions keeps that function pure and useful to callers that are
   * not a page.
   */
  const actions = useMemo(
    () => allActions.filter((a) => a.href !== pathname),
    [allActions, pathname],
  );
  const [profile, setProfile] = useState(() => buildUserProfile(readBehaviorEvents()));
  const [aiExplanation, setAiExplanation] = useState<string | null>(null);
  const [loadingAi, setLoadingAi] = useState(false);
  const shownRef = useRef(false);

  useEffect(() => {
    const ev = readBehaviorEvents();
    const p = buildUserProfile(ev);
    setProfile(p);
    const next = getNextBestActions(p);
    setAllActions(next);

    if (!shownRef.current && next.length > 0) {
      shownRef.current = true;
      void trackEvent("recommendation_shown", {
        intent: p.intent,
        urgency: p.urgency,
        count: next.length,
        action_ids: next.map((a) => a.id),
      });
    }
  }, []);

  useEffect(() => {
    if (actions.length === 0) return;
    let cancelled = false;
    setLoadingAi(true);
    const p = buildUserProfile(readBehaviorEvents());
    fetch("/api/ai/behavior-recommendations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ profile: p, actions }),
    })
      .then((r) => r.json())
      .then((j) => {
        if (cancelled) return;
        if (j?.ok && typeof j.explanation === "string" && j.explanation.trim()) {
          setAiExplanation(j.explanation.trim());
        }
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoadingAi(false);
      });
    return () => {
      cancelled = true;
    };
  }, [actions]);

  if (actions.length === 0) return null;

  return (
    <section className="rounded-2xl border border-indigo-100 bg-gradient-to-br from-indigo-50/90 via-white to-slate-50 p-5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-bold uppercase tracking-wide text-indigo-700">Recommended for you</p>
          <h2 className="mt-1 text-lg font-bold text-slate-900">Next best actions</h2>
          <p className="mt-1 text-sm text-slate-600">
            Based on your recent activity — intent looks{" "}
            <span className="font-semibold text-slate-800">{profile.intent}</span>
            {profile.urgency !== "low" ? (
              <>
                {" "}
                · urgency <span className="font-semibold text-slate-800">{profile.urgency}</span>
              </>
            ) : null}
            .
          </p>
        </div>
      </div>

      {loadingAi ? (
        <p className="mt-3 text-xs text-slate-500">Personalizing explanation…</p>
      ) : aiExplanation ? (
        <p className="mt-3 rounded-lg border border-indigo-100 bg-white/80 px-3 py-2 text-sm leading-relaxed text-slate-700">
          {aiExplanation}
        </p>
      ) : (
        <p className="mt-3 text-xs text-slate-500">
          Rules-based picks from your behavior; enable OpenAI for a richer narrative.
        </p>
      )}

      <ul className="mt-4 space-y-2">
        {actions.map((a) => (
          <li key={a.id}>
            <Link
              href={a.href}
              onClick={() =>
                void trackEvent("recommendation_clicked", {
                  action_id: a.id,
                  href: a.href,
                  priority: a.priority,
                })
              }
              className="flex items-start gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 text-left shadow-sm transition hover:border-indigo-200 hover:bg-indigo-50/50"
            >
              <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-indigo-100 text-xs font-bold text-indigo-800">
                {a.priority}
              </span>
              <span className="min-w-0">
                <span className="block font-semibold text-slate-900">{a.title}</span>
                <span className="mt-0.5 block text-xs text-slate-600">{a.reason}</span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
