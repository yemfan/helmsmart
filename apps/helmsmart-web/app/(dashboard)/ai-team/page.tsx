import type { Metadata } from "next";
import Link from "next/link";
import { defaultAvatarForSeed } from "@helm/ui";
import { getBlueprint } from "@helm/ai-workforce";
import { getWorkforce, getWorkforceSummary } from "@/lib/actions/workforce";
import { getMemberOrgId } from "@/lib/auth/org-context";
import { getMyRole, hasPermission } from "@/lib/rbac";
import { getServerLocale, getServerT } from "@/lib/i18n/server";
import { orgToday } from "@/lib/org-timezone";
import { addDays } from "@/lib/org-date";
import { loadActivityFeed } from "@/lib/ai-activity.load";
import type { ActivityRow } from "@/lib/ai-activity";
import { ALL_ACTIONS } from "@/lib/ai-team/registry";
import { autonomyOf, dialOwners, displayLevel, levelsFor } from "@/lib/ai-team/autonomy";
import { TEAM_SLUGS } from "@/lib/ai-team/faces";
import { SeedWorkforceButton } from "./seed-workforce-button";
import { TeammateCard } from "./teammate-card";

/**
 * The AI Team — one page that answers the three questions the AI workforce
 * never answered before: who works for me, what is each of them allowed to do,
 * and what have they actually done.
 *
 * The control on it is the autonomy dial, and it is a real one: what the owner
 * picks here is what `lib/workforce-gating.ts` and `lib/ai-team/run-action.ts`
 * read the next time that teammate has something to do.
 *
 * The Command Center keeps the org-wide totals and links here; this page keeps
 * the people. Both read the same 30-day window, so the numbers agree.
 */

/** How many days of work each teammate's card lists, and its scorecard counts. */
const WINDOW_DAYS = 30;
/** Lines per teammate — a handful, not a log. */
const WORK_PER_TEAMMATE = 4;

/** Where an idle teammate's work would start. */
const SET_UP_HREF: Record<string, string> = {
  mark: "/ask",
  tim: "/insights",
  emily: "/social",
  alex: "/books/invoices",
  sarah: "/clients",
  emma: "/voice",
};

export async function generateMetadata(): Promise<Metadata> {
  const t = await getServerT("home");
  return { title: t("aiTeam.metaTitle") };
}

export default async function AiTeamPage() {
  const t = await getServerT("home");
  const locale = await getServerLocale();
  const orgId = (await getMemberOrgId()) ?? "";
  const role = await getMyRole();
  const canChange = !!role && hasPermission(role, "team.manage");

  const todayStr = await orgToday(orgId);
  const fromStr = addDays(todayStr, -(WINDOW_DAYS - 1));

  const [employees, summary, activity] = await Promise.all([
    getWorkforce(),
    getWorkforceSummary(fromStr, todayStr),
    loadActivityFeed({ orgId, t, locale, windowDays: WINDOW_DAYS, limit: 200 }),
  ]);

  // Roster order, not the directory's order by department: the owner meets
  // the captain first and the specialists after him, the way the team is
  // described everywhere else. Anyone not on the roster goes last.
  const roster = new Map(TEAM_SLUGS.map((slug, i) => [slug, i]));
  const team = [...employees].sort(
    (a, b) => (roster.get(a.slug) ?? TEAM_SLUGS.length) - (roster.get(b.slug) ?? TEAM_SLUGS.length),
  );

  const owners = dialOwners(ALL_ACTIONS);
  const metricsById = new Map(summary.employees.map((e) => [e.employeeId, e.metrics]));

  // Every line the feed produced, filed under the teammate it belongs to.
  // Work with no person behind it (a reminder text the schedule sent) belongs
  // to nobody's card and stays on the dashboard.
  const workBySlug = new Map<string, ActivityRow[]>();
  for (const row of activity?.rows ?? []) {
    if (row.who.kind !== "employee") continue;
    const list = workBySlug.get(row.who.slug) ?? [];
    if (list.length < WORK_PER_TEAMMATE) list.push(row);
    workBySlug.set(row.who.slug, list);
  }

  return (
    <div className="p-8 max-w-7xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-slate-900">{t("aiTeam.title")}</h1>
        <p className="text-sm text-slate-500 mt-0.5">{t("aiTeam.subtitle")}</p>
        <p className="text-sm text-slate-600 mt-2">
          <Link href="/command-center" className="font-medium text-indigo-600 hover:text-indigo-800">
            {t("aiTeam.commandCenter")}
          </Link>
        </p>
      </div>

      {employees.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-12 text-center">
          <h2 className="text-lg font-semibold text-slate-900">{t("commandCenter.board.emptyTitle")}</h2>
          <p className="text-sm text-slate-500 mt-1 mb-6 max-w-md mx-auto">{t("commandCenter.board.emptyBody")}</p>
          <SeedWorkforceButton />
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
          {team.map((e) => {
            const levels = levelsFor(e.slug, owners);
            return (
            <TeammateCard
              key={e.id}
              employeeId={e.id}
              slug={e.slug}
              name={e.name}
              role={e.role}
              status={e.status}
              avatar={e.avatar ?? getBlueprint(e.slug)?.avatar ?? defaultAvatarForSeed(e.slug)}
              levels={levels}
              current={displayLevel(autonomyOf(e, e.slug), levels)}
              canChange={canChange}
              metrics={metricsById.get(e.id) ?? {}}
              work={workBySlug.get(e.slug) ?? []}
              setUpHref={SET_UP_HREF[e.slug] ?? "/home"}
              locale={locale}
              timeZone={activity?.timeZone ?? "UTC"}
            />
            );
          })}
        </div>
      )}
    </div>
  );
}
