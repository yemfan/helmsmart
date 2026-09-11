"use client";

import Link from "next/link";
import type { WorkforceSummary } from "@helm/dna-intelligence";
import { useTranslation } from "react-i18next";
import { CommandCenterGrid, type DnaNode } from "@/components/shell/CommandCenterGrid";
import { commandCenterState } from "@/lib/command-center";

/**
 * "calls_answered" → "Calls Answered", the last-resort label for a metric key
 * that has no entry under `metrics.*`. Every key the workforce records today
 * is in the bundle; this keeps an unrecognised one readable instead of
 * printing `metrics.some_new_key` on the grid.
 */
function humanize(key: string): string {
  return key.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

/**
 * The executive grid, showing only what has data.
 *
 * It used to draw nine DNA module nodes whose only KPI was a "Health" of null
 * — a grid of dashes and "unconfigured" labels — beside a briefing that, with
 * no work done, read "completed 0 actions… health metrics are rolling out".
 * Now: the AI Workforce node when the workforce did real work; otherwise a
 * sentence that says what is true and what to do next. Module nodes come back
 * when a module has a real health feed to put in them.
 */
export function CommandCenterView({
  summary,
  receptionistLive,
}: {
  summary: WorkforceSummary;
  /** The org has a number and the AI receptionist switched on. */
  receptionistLive: boolean;
}) {
  const { t } = useTranslation("home");
  const state = commandCenterState(summary, receptionistLive);

  if (state.kind === "unconfigured") {
    return <p className="max-w-2xl text-sm text-slate-600">{t("commandCenter.briefing.unconfigured")}</p>;
  }

  if (state.kind === "idle") {
    return (
      <div className="max-w-2xl space-y-1 text-sm text-slate-600">
        <p>{t("commandCenter.briefing.idle")}</p>
        {state.receptionistLive ? (
          <p>{t("commandCenter.briefing.idleReceptionistLive")}</p>
        ) : (
          <p>
            {t("commandCenter.briefing.idleNextStep")}{" "}
            <Link href="/voice" className="font-medium text-indigo-600 hover:text-indigo-700">
              {t("commandCenter.briefing.setUpReceptionist")}
            </Link>
          </p>
        )}
      </div>
    );
  }

  const nodes: DnaNode[] = [
    {
      id: "ai-workforce",
      label: t("commandCenter.nodes.aiWorkforce"),
      status: "ok",
      kpis: state.topMetrics.map(([k, v]) => ({
        label: t(`metrics.${k}`, { defaultValue: humanize(k) }),
        value: v,
      })),
    },
  ];

  const briefing = t("commandCenter.briefing.active", {
    actions: t("commandCenter.briefing.actions", { count: state.totalActions }),
    employees: t("commandCenter.briefing.employees", { count: state.employeeCount }),
  });

  return <CommandCenterGrid nodes={nodes} briefing={briefing} />;
}
