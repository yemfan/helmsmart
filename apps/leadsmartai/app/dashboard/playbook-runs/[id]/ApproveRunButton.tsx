"use client";

import { useState, useTransition } from "react";
import { useTranslation } from "react-i18next";

import { runPlaybookTaskAction } from "./actions";

/**
 * "Approve & run" for one AI-executable playbook task — hands it to the owning
 * assistant to run now. Used when the assistant isn't already on autopilot.
 */
export function ApproveRunButton({ runId, taskId }: { runId: string; taskId: string }) {
  const { t } = useTranslation("dashboard");
  const [done, setDone] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function run() {
    setError(null);
    startTransition(async () => {
      const res = await runPlaybookTaskAction(runId, taskId);
      if (res.ok) setDone(res.note);
      else setError(res.error);
    });
  }

  if (done) return <span className="text-xs font-medium text-emerald-600 dark:text-emerald-400">✓ {done}</span>;

  return (
    <span className="inline-flex items-center gap-2">
      <button
        type="button"
        onClick={run}
        disabled={pending}
        className="rounded-lg bg-blue-600 px-2.5 py-1 text-xs font-semibold text-white transition hover:bg-blue-700 disabled:opacity-50"
      >
        {pending ? t("pages.playbookRunDetail.running") : t("pages.playbookRunDetail.approveRun")}
      </button>
      {error ? <span className="text-xs text-red-600 dark:text-red-400">{error}</span> : null}
    </span>
  );
}
