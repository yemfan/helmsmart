"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { useTranslation } from "react-i18next";

type FiringOutcome =
  | "created_draft"
  | "dry_run"
  | "suppressed_opt_in"
  | "suppressed_agent_of_record"
  | "suppressed_template_off"
  | "suppressed_per_contact_trigger_off"
  | "already_fired"
  | "error";

type Firing = {
  contactName: string;
  templateId: string;
  channel: string;
  periodKey: string;
  outcome: FiringOutcome;
  draftStatus?: "pending" | "approved";
  error?: string;
};

type Result = {
  agents: number;
  contacts: number;
  firings: Firing[];
  counts: {
    created: number;
    dryRun: number;
    suppressed: number;
    alreadyFired: number;
    errors: number;
  };
};

export default function RunSchedulerButton() {
  const { t } = useTranslation("dashboard");
  const router = useRouter();
  const [pending, setPending] = useState<null | "preview" | "commit">(null);
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);

  async function run(mode: "preview" | "commit") {
    setPending(mode);
    setError(null);
    try {
      const res = await fetch("/api/dashboard/scheduler/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dryRun: mode === "preview" }),
      });
      const data = (await res.json()) as Result & { ok?: boolean; error?: string };
      if (!res.ok || data.ok === false) {
        throw new Error((data as { error?: string }).error || `${mode} failed`);
      }
      setResult(data);
      setExpanded(true);
      if (mode === "commit" && data.counts.created > 0) router.refresh();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : `${mode} failed`);
    } finally {
      setPending(null);
    }
  }

  return (
    <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">{t("pages.scheduler.scheduler")}</div>
          <div className="mt-0.5 text-xs text-slate-500">
            Walk every sphere contact and fire date- and threshold-based triggers (anniversary,
            equity, dormancy, quarterly). Respects agent-of-record + opt-in guards per spec §2.8.
            Runs automatically every day at 09:00 UTC.
          </div>
        </div>
        <div className="flex shrink-0 gap-2">
          <button
            type="button"
            onClick={() => void run("preview")}
            disabled={pending !== null}
            className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-xs font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-50"
          >
            {pending === "preview" ? t("common:status.previewing") : t("common:actions.preview")}
          </button>
          <button
            type="button"
            onClick={() => void run("commit")}
            disabled={pending !== null}
            className="rounded-lg bg-brand-accent px-3 py-2 text-xs font-medium text-white disabled:opacity-50"
          >
            {pending === "commit" ? t("common:status.running") : t("pages.runSchedulerButton.runNow")}
          </button>
        </div>
      </div>

      {error && <div className="mt-3 text-sm text-red-600">{error}</div>}

      {result && (
        <div className="mt-3 space-y-2">
          <div className="flex flex-wrap gap-2 text-xs">
            <Chip label={t("pages.scheduler.contacts")} value={result.contacts} />
            <Chip label={t("pages.scheduler.created")} value={result.counts.created} tone="green" />
            <Chip label={t("pages.scheduler.previewOnly")} value={result.counts.dryRun} />
            <Chip label={t("pages.scheduler.suppressed")} value={result.counts.suppressed} tone="amber" />
            <Chip label={t("pages.scheduler.alreadyFired")} value={result.counts.alreadyFired} />
            <Chip label={t("pages.scheduler.errors")} value={result.counts.errors} tone={result.counts.errors ? "red" : undefined} />
          </div>

          {result.firings.length > 0 && (
            <details open={expanded} onToggle={(e) => setExpanded(e.currentTarget.open)}>
              <summary className="cursor-pointer text-xs text-slate-600 dark:text-slate-400">{t("pages.runScheduler.showFirings", { count: result.firings.length })}
              </summary>
              <div className="mt-2 max-h-80 overflow-auto rounded-lg border border-slate-200 dark:border-slate-700">
                <table className="w-full text-[11px]">
                  <thead className="sticky top-0 bg-slate-50 dark:bg-slate-900/60">
                    <tr>
                      <Th>{t("pages.scheduler.colContact")}</Th>
                      <Th>{t("pages.scheduler.colTemplate")}</Th>
                      <Th>{t("pages.scheduler.colPeriod")}</Th>
                      <Th>{t("pages.scheduler.colOutcome")}</Th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {result.firings.map((f, i) => (
                      <tr key={i} className={f.outcome === "error" ? "bg-red-50/40" : ""}>
                        <Td>{f.contactName}</Td>
                        <Td>
                          <span className="font-mono">{f.templateId}</span>{" "}
                          <span className="text-slate-400">· {f.channel}</span>
                        </Td>
                        <Td className="font-mono text-slate-500">{f.periodKey}</Td>
                        <Td>
                          <OutcomePill outcome={f.outcome} draftStatus={f.draftStatus} />
                          {f.error && (
                            <div className="text-[10px] text-red-600">{f.error}</div>
                          )}
                        </Td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </details>
          )}
        </div>
      )}
    </div>
  );
}

function Chip({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone?: "green" | "amber" | "red";
}) {
  const cls =
    tone === "green"
      ? "border-green-200 bg-green-50 text-green-800"
      : tone === "amber"
        ? "border-amber-200 bg-amber-50 text-amber-800"
        : tone === "red"
          ? "border-red-200 bg-red-50 text-red-800"
          : "border-slate-200 bg-slate-50 text-slate-700";
  return (
    <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 ${cls}`}>
      <span className="font-semibold tabular-nums">{value}</span>
      <span className="text-[10px] uppercase tracking-wide">{label}</span>
    </span>
  );
}

function OutcomePill({
  outcome,
  draftStatus,
}: {
  outcome: FiringOutcome;
  draftStatus?: "pending" | "approved";
}) {
  const labels: Record<FiringOutcome, string> = {
    created_draft: draftStatus === "approved" ? "Created (approved)" : "Created (pending)",
    dry_run: "Would create",
    suppressed_opt_in: "Suppressed · opt-in",
    suppressed_agent_of_record: "Suppressed · AoR",
    suppressed_template_off: "Suppressed · template off",
    suppressed_per_contact_trigger_off: "Suppressed · per-contact",
    already_fired: "Already fired",
    error: "Error",
  };
  const tone =
    outcome === "created_draft"
      ? "bg-green-50 text-green-700"
      : outcome === "dry_run"
        ? "bg-blue-50 text-blue-700"
        : outcome === "already_fired"
          ? "bg-slate-100 text-slate-500"
          : outcome === "error"
            ? "bg-red-50 text-red-700"
            : "bg-amber-50 text-amber-700";
  return (
    <span className={`inline-flex rounded px-1.5 py-0.5 text-[10px] font-semibold ${tone}`}>
      {labels[outcome]}
    </span>
  );
}

function Th({ children }: { children: React.ReactNode }) {
  return (
    <th className="px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-wide text-slate-500">
      {children}
    </th>
  );
}

function Td({ children, className }: { children: React.ReactNode; className?: string }) {
  return <td className={`px-3 py-2 align-top ${className ?? ""}`}>{children}</td>;
}
