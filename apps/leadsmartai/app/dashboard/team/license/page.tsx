import type { Metadata } from "next";
import { getServerT } from "@/lib/i18n/server";
import { getCurrentAgentContext } from "@/lib/dashboardService";
import { listTeamsForAgent } from "@/lib/teams/service";
import { loadTeamBrand } from "@/lib/teams/brand.server";
import { loadAgentLicense } from "@/lib/teams/license.server";
import { LicenseForm } from "@/components/team/LicenseForm";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getServerT();
  return { title: t("pages.teamLicense.metaTitle", { ns: "dashboard" }) };
}

/**
 * The agent's license, asked for once at team onboarding (the accept flow
 * lands here when none is on file) and editable afterwards. The brokerage
 * requires it: it goes on every published post and on the hub footer.
 */
export default async function TeamLicensePage() {
  const t = await getServerT();
  const ctx = await getCurrentAgentContext();
  const [license, teams] = await Promise.all([loadAgentLicense(ctx.agentId), listTeamsForAgent(ctx.agentId)]);
  const team = teams[0] ?? null;
  const brand = team ? await loadTeamBrand(team.id).catch(() => null) : null;
  const brokerage = brand?.name ?? team?.name ?? null;

  return (
    <div className="mx-auto max-w-2xl p-6">
      <section className="rounded-2xl border border-slate-200 bg-white p-6 ring-1 ring-slate-900/[0.04] shadow-sm dark:border-slate-700 dark:bg-slate-900">
        <h1 className="text-xl font-semibold text-slate-900 dark:text-slate-100">{t("pages.teamLicense.title", { ns: "dashboard" })}</h1>
        <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
          {brokerage ? t("pages.teamLicense.introBrokerage", { ns: "dashboard", brokerage }) : t("pages.teamLicense.intro", { ns: "dashboard" })}
        </p>
        <div className="mt-4">
          <LicenseForm initial={license} required continueHref="/dashboard/team" />
        </div>
        <p className="mt-4 text-xs text-slate-500 dark:text-slate-400">{t("pages.teamLicense.note", { ns: "dashboard" })}</p>
      </section>
    </div>
  );
}
