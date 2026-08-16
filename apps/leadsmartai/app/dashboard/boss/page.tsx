import { getCurrentAgentContext } from "@/lib/dashboardService";
import { supabaseServer } from "@/lib/supabaseServer";
import { UpgradeBanner } from "@/components/upsell/UpgradeBanner";
import BossAssistantClient from "./BossAssistantClient";
import type { Metadata } from "next";
import { getServerT } from "@/lib/i18n/server";

export const metadata: Metadata = {
  title: "Ask Max",
  description:
    "Max, captain of your AI team — morning briefing, today's priorities, hot leads, and AI team activity.",
  robots: { index: false },
};

/**
 * CloseBoss command center — the default home for agents. The Boss
 * Assistant aggregates leads, tasks, calendar, transactions, and AI
 * team activity into a single "what needs my attention today" view.
 */
export default async function BossAssistantPage() {
  const t = await getServerT();
  const ctx = await getCurrentAgentContext();

  const { data: profileRow } = await supabaseServer
    .from("user_profiles")
    .select("full_name")
    .eq("user_id", ctx.userId)
    .maybeSingle();

  const greetingName =
    String((profileRow as { full_name?: string | null } | null)?.full_name ?? "")
      .trim()
      .split(/\s+/)[0] ?? "";

  return (
    <div className="space-y-4">
      <UpgradeBanner planType={ctx.planType} variant="banner" />
      <BossAssistantClient greetingName={greetingName} />
    </div>
  );
}
