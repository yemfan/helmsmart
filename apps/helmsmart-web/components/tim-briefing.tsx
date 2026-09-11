"use client";

import { useTranslation } from "react-i18next";
import { Avatar, defaultAvatarForSeed } from "@helm/ui";
import { getBlueprint } from "@helm/ai-workforce";

type TimData = {
  overdueInvoices: number;
  /** Already formatted for the org's currency and the reader's locale. */
  overdueTotal: string;
  openTasks: number;
  urgentTasks: number;
};

/**
 * Tim's Briefing — a read-only CIO intelligence summary on the Command Center.
 * Tim is "suggest" autonomy: no approval flow, no actions — just surfaces what
 * the data says so the owner can decide what to act on.
 */
export function TimBriefing({ data }: { data: TimData }) {
  const { t } = useTranslation("home");
  const { overdueInvoices, overdueTotal, openTasks, urgentTasks } = data;

  const insights: string[] = [];
  if (overdueInvoices > 0) {
    insights.push(t("commandCenter.tim.overdue", { count: overdueInvoices, amount: overdueTotal }));
  }
  if (urgentTasks > 0) insights.push(t("commandCenter.tim.urgentTasks", { count: urgentTasks }));
  else if (openTasks > 0) insights.push(t("commandCenter.tim.openTasks", { count: openTasks }));
  if (insights.length === 0) insights.push(t("commandCenter.tim.allClear"));

  const avatar = getBlueprint("tim")?.avatar ?? defaultAvatarForSeed("tim");

  return (
    <div className="mt-8 bg-white rounded-2xl border border-slate-200 p-6">
      <div className="flex items-center gap-3 mb-4">
        {/* The shared avatar set ships as SVG; `Avatar` owns the URL, so this
            card cannot drift from the files again (it asked for a .png → 404). */}
        <Avatar id={avatar} size={36} alt="Tim" />
        <div>
          <p className="text-sm font-semibold text-slate-800">{t("commandCenter.tim.role")}</p>
          <p className="text-xs text-slate-400">{t("commandCenter.tim.todaysBriefing")}</p>
        </div>
      </div>
      <ul className="space-y-2">
        {insights.map((line, i) => (
          <li key={i} className="flex items-start gap-2 text-sm text-slate-700">
            <span className="text-slate-300 mt-0.5 flex-shrink-0">→</span>
            {line}
          </li>
        ))}
      </ul>
    </div>
  );
}
