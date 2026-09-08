import { getCurrentAgentContext } from "@/lib/dashboardService";
import { supabaseServer } from "@/lib/supabaseServer";
import BossAssistantClient, { type BossInitialData } from "./BossAssistantClient";
import { listRecentInstructions, listRecentRuns, unreadMorningBriefing } from "@/lib/closeboss/conversation";
import { listBossRecommendations } from "@/lib/closeboss/recommendations";
import { goalKey } from "@/lib/closeboss/goal";
import type { Metadata } from "next";
import { getServerT } from "@/lib/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getServerT();
  const title = t("pages.dashboardTitles.askMax", { ns: "dashboard" });
  return {
  title,
  description:
    "Max, captain of your AI team — morning briefing, today's priorities, hot leads, and AI team activity.",
  robots: { index: false },
};
}

/**
 * CloseBoss command center — the default home for agents. The Boss
 * Assistant aggregates leads, tasks, calendar, transactions, and AI
 * team activity into a single "what needs my attention today" view.
 */
export default async function BossAssistantPage() {
  const t = await getServerT();
  const ctx = await getCurrentAgentContext();

  const agentId = String(ctx.agentId);

  // The thread itself is rendered here, not fetched after hydration: loaded
  // from the browser it painted ~7.5 s after navigation (see
  // lib/closeboss/conversation.ts). Each read is the same query its API
  // route runs; the client keeps polling those routes for changes.
  const [{ data: profileRow }, { data: agentRow }, conversation, runs, briefing] = await Promise.all([
    supabaseServer
      .from("user_profiles")
      .select("full_name")
      .eq("user_id", ctx.userId)
      .maybeSingle(),
    supabaseServer
      .from("agents")
      .select("onboarding")
      .eq("id", ctx.agentId as never)
      .maybeSingle(),
    listRecentInstructions(agentId, { limit: 6 }).catch(() => null),
    listRecentRuns(agentId, 12).catch(() => [] as Awaited<ReturnType<typeof listRecentRuns>>),
    unreadMorningBriefing(agentId),
  ]);
  // "One win this month" from Max's welcome interview — orders the quick
  // commands under the composer. Null until the realtor has answered.
  const goal = goalKey((agentRow as { onboarding?: { goal?: unknown } | null } | null)?.onboarding?.goal);
  // Priorities without the CRM-signal sync the API route does first: that
  // sync is the slow half, and the client's own fetch runs it moments later.
  const recommendations = await listBossRecommendations(agentId, 5, goal).catch(() => []);

  // The client types its rows by the API's JSON shape; these are the same
  // rows from the same queries, one hop shorter.
  const initial: BossInitialData | null = conversation
    ? {
        instructions: conversation.instructions as BossInitialData["instructions"],
        tasks: conversation.tasks as unknown as BossInitialData["tasks"],
        hasMore: conversation.hasMore,
        runs: runs as BossInitialData["runs"],
        briefing: briefing as BossInitialData["briefing"],
        recommendations: recommendations as BossInitialData["recommendations"],
      }
    : null;

  const greetingName =
    String((profileRow as { full_name?: string | null } | null)?.full_name ?? "")
      .trim()
      .split(/\s+/)[0] ?? "";

  return (
    <div className="space-y-4">
      <BossAssistantClient greetingName={greetingName} goal={goal} initial={initial} />
    </div>
  );
}
