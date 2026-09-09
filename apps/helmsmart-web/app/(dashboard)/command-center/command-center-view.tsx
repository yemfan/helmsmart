"use client";

import type { WorkforceSummary } from "@helm/dna-intelligence";
import { useTranslation } from "react-i18next";
import { CommandCenterGrid, type DnaNode } from "@/components/shell/CommandCenterGrid";

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
 * The DNA module nodes on the executive grid. The AI Workforce node is fed live
 * from the workforce roll-up; the rest link into their live sections today and
 * gain KPIs as each module's Command Center `getHealth` feed is wired.
 *
 * `labelKey` is a key under `commandCenter.nodes`, not a label: the grid draws
 * whatever string it is handed, so the translation happens here.
 */
const MODULE_NODES: { id: string; labelKey: string; drillHref?: string; live: boolean }[] = [
  { id: "finance",       labelKey: "finance",       drillHref: "/books",     live: true },
  { id: "revenue",       labelKey: "revenue",       drillHref: "/pipeline",  live: true },
  { id: "communication", labelKey: "communication", drillHref: "/inbox",     live: true },
  { id: "marketing",     labelKey: "marketing",     drillHref: "/marketing", live: true },
  { id: "operations",    labelKey: "operations",    drillHref: "/tasks",     live: true },
  { id: "service",       labelKey: "service",       drillHref: "/reception", live: true },
  { id: "intelligence",  labelKey: "intelligence",  drillHref: "/reports",   live: true },
  { id: "people",        labelKey: "people",        live: false },
  { id: "knowledge",     labelKey: "knowledge",     live: false },
];

export function CommandCenterView({ summary }: { summary: WorkforceSummary }) {
  const { t } = useTranslation("home");
  const totalEntries = Object.entries(summary.totals).sort((a, b) => b[1] - a[1]);
  const workforceKpis = totalEntries.slice(0, 3).map(([k, v]) => ({
    label: t(`metrics.${k}`, { defaultValue: humanize(k) }),
    value: v,
  }));
  const totalActions = totalEntries.reduce((sum, [, v]) => sum + v, 0);
  const employeeCount = summary.employees.length;

  const nodes: DnaNode[] = [
    {
      id: "ai-workforce",
      label: t("commandCenter.nodes.aiWorkforce"),
      status: employeeCount > 0 ? "ok" : "unconfigured",
      kpis:
        workforceKpis.length > 0
          ? workforceKpis
          : [{ label: t("commandCenter.kpi.employees"), value: employeeCount || null }],
    },
    ...MODULE_NODES.map((m): DnaNode => ({
      id: m.id,
      label: t(`commandCenter.nodes.${m.labelKey}`),
      status: m.live ? "ok" : "unconfigured",
      kpis: [{ label: t("commandCenter.kpi.health"), value: null }],
      drillHref: m.drillHref,
    })),
  ];

  const briefing =
    employeeCount === 0
      ? t("commandCenter.briefing.unconfigured")
      : t("commandCenter.briefing.active", {
          actions: t("commandCenter.briefing.actions", { count: totalActions }),
          employees: t("commandCenter.briefing.employees", { count: employeeCount }),
        });

  return <CommandCenterGrid nodes={nodes} briefing={briefing} />;
}
