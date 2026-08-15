"use client";

import { useState, useTransition } from "react";
import { useTranslation } from "react-i18next";

import { optimizeRunAction } from "./actions";

/**
 * The "optimize as we go" control. The agent notes how it's going, the AI
 * proposes prioritized adjustments, and an approval task is filed. Nothing acts
 * without the agent — this is the approval-gated review step.
 */
export function OptimizePanel({ runId }: { runId: string }) {
  const { t } = useTranslation("dashboard");
  const [note, setNote] = useState("");
  const [suggestions, setSuggestions] = useState<string[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function run() {
    setError(null);
    startTransition(async () => {
      const res = await optimizeRunAction(runId, note);
      if (res.ok) {
        setSuggestions(res.suggestions);
        setNote("");
      } else {
        setError(res.error);
      }
    });
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
      <h3 className="text-sm font-semibold text-slate-900 dark:text-white">{t("pages.playbookRunDetail.optimizeHeading")}</h3>
      <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
        Note how it&rsquo;s going (showings, feedback, what the buyer liked). The AI proposes prioritized
        adjustments and files an approval task — nothing changes until you approve it.
      </p>
      <textarea
        value={note}
        onChange={(e) => setNote(e.target.value)}
        disabled={pending}
        rows={3}
        placeholder={t("pages.playbookRunDetail.optimizePlaceholder")}
        className="mt-3 w-full rounded-lg border border-slate-200 bg-white p-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/30 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
      />
      <button
        type="button"
        onClick={run}
        disabled={pending}
        className="mt-3 inline-flex items-center justify-center rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-blue-700 disabled:opacity-50"
      >
        {pending ? t("pages.playbookRunDetail.optimizing") : t("pages.playbookRunDetail.optimize")}
      </button>

      {error ? <p className="mt-3 text-sm text-red-600 dark:text-red-400">{error}</p> : null}

      {suggestions ? (
        <div className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50 p-3 dark:border-emerald-900/50 dark:bg-emerald-950/30">
          <p className="text-xs font-semibold text-emerald-800 dark:text-emerald-300">
            Proposed adjustments — filed as an approval task
          </p>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-slate-700 dark:text-slate-300">
            {suggestions.map((s, i) => (
              <li key={i}>{s}</li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
