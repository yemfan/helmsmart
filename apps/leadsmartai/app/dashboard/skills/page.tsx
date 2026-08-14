import type { Metadata } from "next";
import { headers } from "next/headers";

import { getCurrentAgentContext } from "@/lib/dashboardService";
import { getResolvedSkills, getAgentStateCompliance } from "@/lib/realtyboss/skills/service";
import { ASSIGNEE_LABEL, PILLAR_LABEL } from "@/lib/realtyboss/skills/catalog";
import { SkillsManager, type SkillRow } from "./SkillsManager";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Skills Library",
  description: "The Realtor AI skills library — assign skills to each assistant with state-aware compliance built in.",
  robots: { index: false },
};

/**
 * Skills — the Realtor AI skills library, assigned to each AI assistant and
 * editable by the agent. Compliance is state-parameterized: the state is
 * resolved from the agent's primary market (fallback: IP geo), so every skill
 * applies the right license authority + rules automatically.
 */
import { getServerT } from "@/lib/i18n/server";

export default async function SkillsPage() {
  const serverT = await getServerT();
  const tr = (key: string, o?: Record<string, unknown>) => serverT(key, { ns: "dashboard", ...o });
  const ctx = await getCurrentAgentContext();
  const h = await headers();
  const ipRegion = h.get("x-vercel-ip-country-region"); // US state code on Vercel

  const [skills, compliance] = await Promise.all([
    getResolvedSkills(ctx.agentId),
    getAgentStateCompliance(ctx.agentId, ipRegion),
  ]);

  const rows: SkillRow[] = skills.map((s) => ({
    id: s.id,
    num: s.num,
    title: s.title,
    pillarLabel: PILLAR_LABEL[s.pillar],
    value: s.value,
    isValidator: Boolean(s.isValidator),
    enabled: s.enabled,
    assignee: s.assignee,
  }));

  const enabledTotal = rows.filter((r) => r.enabled).length;
  const knownState = compliance.state !== "your state";

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-4 sm:p-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900 dark:text-white">{tr("more.skills.title")}</h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          {tr("more.skills.subtitle", { enabled: enabledTotal, total: rows.length })}
        </p>
      </div>

      {/* Compliance state banner */}
      <div className="rounded-xl border border-blue-200 bg-blue-50 p-3 text-sm dark:border-blue-900/50 dark:bg-blue-950/30">
        <span className="font-medium text-blue-900 dark:text-blue-200">
          Compliance: {knownState ? compliance.state : "not set"}
        </span>
        <span className="text-blue-800/80 dark:text-blue-300/80">
          {knownState
            ? ` — skills apply ${compliance.state} rules and cite ${compliance.licenseAuthority}. Detected from your primary market.`
            : " — set your primary market in Settings so skills apply the right state's rules and license authority."}
        </span>
      </div>

      <SkillsManager initial={rows} assigneeLabels={ASSIGNEE_LABEL} />
    </div>
  );
}
