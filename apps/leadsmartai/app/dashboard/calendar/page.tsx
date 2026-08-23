import { getCurrentAgentContext } from "@/lib/dashboardService";
import { supabaseServer } from "@/lib/supabaseServer";
import CalendarClient from "./CalendarClient";
import type { Metadata } from "next";
import { getServerT } from "@/lib/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getServerT();
  const title = t("pages.dashboardTitles.calendar", { ns: "dashboard" });
  return {
  title,
  description: "Schedule and manage showings, calls, and follow-ups.",
  keywords: ["calendar", "scheduling", "appointments"],
  robots: { index: false },
};
}

export default async function CalendarPage() {
  const ctx = await getCurrentAgentContext();

  const { data: leads } = await supabaseServer
    .from("contacts")
    .select("id, name")
    .eq("agent_id", ctx.agentId)
    .limit(500);

  return (
    <CalendarClient
      leads={(leads ?? []).map((l: any) => ({ id: String(l.id), name: l.name }))}
    />
  );
}
