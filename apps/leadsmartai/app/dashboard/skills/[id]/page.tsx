import Link from "next/link";
import { notFound } from "next/navigation";

import { getCurrentAgentContext } from "@/lib/dashboardService";
import { getSkill, ASSIGNEE_LABEL, PILLAR_LABEL } from "@/lib/realtyboss/skills/catalog";
import { getResolvedSkills } from "@/lib/realtyboss/skills/service";
import { skillInputKeys } from "@/lib/realtyboss/skills/run";
import { SkillRunner } from "./SkillRunner";

export const dynamic = "force-dynamic";

export default async function SkillRunPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const skill = getSkill(id);
  if (!skill) notFound();

  const ctx = await getCurrentAgentContext();
  const resolved = (await getResolvedSkills(ctx.agentId)).find((s) => s.id === id);
  const assignee = resolved?.assignee ?? skill.defaultAssignee;
  const enabled = resolved?.enabled ?? true;
  const inputKeys = skillInputKeys(skill);

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-4 sm:p-6">
      <div>
        <Link href="/dashboard/skills" className="text-sm text-blue-600 hover:underline dark:text-blue-400">
          ← All skills
        </Link>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900 dark:text-white">{skill.title}</h1>
          <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[11px] text-slate-500 dark:bg-slate-800 dark:text-slate-400">
            {PILLAR_LABEL[skill.pillar]}
          </span>
          <span className="rounded bg-indigo-50 px-1.5 py-0.5 text-[11px] font-medium text-indigo-700 dark:bg-indigo-500/10 dark:text-indigo-300">
            {ASSIGNEE_LABEL[assignee]}
          </span>
          {skill.isValidator ? (
            <span className="rounded bg-emerald-100 px-1.5 py-0.5 text-[11px] font-medium text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300">
              validator
            </span>
          ) : null}
        </div>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{skill.value}</p>
      </div>

      {!enabled ? (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-300">
          This skill is turned off. Turn it on from <Link href="/dashboard/skills" className="underline">Skills</Link> to run it.
        </div>
      ) : (
        <SkillRunner skillId={skill.id} inputKeys={inputKeys} assigneeLabel={ASSIGNEE_LABEL[assignee]} />
      )}
    </div>
  );
}
