import { getCurrentAgentContext } from "@/lib/dashboardService";
import { supabaseServer } from "@/lib/supabaseServer";
import BossAssistantClient from "./BossAssistantClient";
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

  const [{ data: profileRow }, { data: agentRow }] = await Promise.all([
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
  ]);
  // "One win this month" from Max's welcome interview — orders the quick
  // commands under the composer. Null until the realtor has answered.
  const goal = goalKey((agentRow as { onboarding?: { goal?: unknown } | null } | null)?.onboarding?.goal);

  const greetingName =
    String((profileRow as { full_name?: string | null } | null)?.full_name ?? "")
      .trim()
      .split(/\s+/)[0] ?? "";

  return (
    <div className="space-y-4">
      <BossAssistantClient greetingName={greetingName} goal={goal} />
    </div>
  );
}
