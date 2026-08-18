import Link from "next/link";
import { notFound } from "next/navigation";

import { getCurrentAgentContext } from "@/lib/dashboardService";
import { getSkillRun } from "@/lib/closeboss/skills/run";
import { getSkill, ASSIGNEE_LABEL, type SkillAssignee } from "@/lib/closeboss/skills/catalog";
import { CopyButton } from "./CopyButton";
import { getServerT } from "@/lib/i18n/server";

export const dynamic = "force-dynamic";

function humanize(key: string): string {
  return key.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

export default async function SkillRunViewPage({ params }: { params: Promise<{ id: string }> }) {
  const t = await getServerT();
  const { id } = await params;
  const ctx = await getCurrentAgentContext();
  const run = await getSkillRun(ctx.agentId, id);
  if (!run) notFound();

  const skill = getSkill(run.skill_id);
  const assignee = (run.assignee as SkillAssignee | null) ?? "sales_assistant";
  const inputEntries = Object.entries(run.inputs ?? {});

  return (
    <div className="mx-auto max-w-3xl space-y-5 p-4 sm:p-6">
      <div>
        <Link href="/dashboard/skills" className="text-sm text-blue-600 hover:underline dark:text-blue-400">
          {t("pages.skillRun.allSkills", { ns: "dashboard" })}
        </Link>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900 dark:text-white">
            {skill?.title ?? run.skill_id}
          </h1>
          <span className="rounded bg-indigo-50 px-1.5 py-0.5 text-[11px] font-medium text-indigo-700 dark:bg-indigo-500/10 dark:text-indigo-300">
            {ASSIGNEE_LABEL[assignee]}
          </span>
        </div>
      </div>

      {inputEntries.length > 0 ? (
        <div className="rounded-xl border border-slate-200 bg-white p-3 text-xs dark:border-slate-800 dark:bg-slate-900">
          <span className="font-medium text-slate-500 dark:text-slate-400">{t("pages.skillRun.inputs", { ns: "dashboard" })}</span>
          {inputEntries.map(([k, v], i) => (
            <span key={k} className="text-slate-600 dark:text-slate-300">
              {i > 0 ? " · " : ""}
              <span className="font-medium">{humanize(k)}:</span> {String(v).slice(0, 120)}
            </span>
          ))}
        </div>
      ) : null}

      {run.gate ? (
        <div
          className={`rounded-lg border p-3 text-sm ${
            run.gate.status === "pass"
              ? "border-emerald-200 bg-emerald-50 dark:border-emerald-900/50 dark:bg-emerald-950/30"
              : "border-amber-200 bg-amber-50 dark:border-amber-900/50 dark:bg-amber-950/30"
          }`}
        >
          <p className={`font-semibold ${run.gate.status === "pass" ? "text-emerald-700 dark:text-emerald-300" : "text-amber-800 dark:text-amber-300"}`}>
            {t(run.gate.status === "pass" ? "pages.skillRun.gatePassed" : "pages.skillRun.gateFlagged", {
              ns: "dashboard",
            })}
          </p>
          {run.gate.issues.length > 0 ? (
            <ul className="mt-2 space-y-1.5 text-slate-700 dark:text-slate-300">
              {run.gate.issues.map((it, i) => (
                <li key={i}>
                  <span className="font-medium">{it.issue}</span>
                  {it.rewrite ? <span className="text-slate-500 dark:text-slate-400"> → {it.rewrite}</span> : null}
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}

      <div className="rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
        <div className="flex items-center justify-between border-b border-slate-200 px-4 py-2 dark:border-slate-800">
          <span className="text-xs font-medium text-slate-500 dark:text-slate-400">{t("pages.skillRun.output", { ns: "dashboard" })}</span>
          <CopyButton text={run.output} />
        </div>
        <div className="whitespace-pre-wrap p-4 text-sm text-slate-800 dark:text-slate-200">{run.output}</div>
      </div>
    </div>
  );
}
