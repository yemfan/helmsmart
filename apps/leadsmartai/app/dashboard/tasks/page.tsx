import { getCurrentAgentContext } from "@/lib/dashboardService";
import { supabaseServer } from "@/lib/supabaseServer";
import TasksClient from "./TasksClient";
import type { Metadata } from "next";
import { getServerT } from "@/lib/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getServerT();
  const title = t("pages.dashboardTitles.tasks", { ns: "dashboard" });
  return {
  title,
  description: "Manage your daily tasks and follow-up reminders.",
  keywords: ["tasks", "to-do", "follow-ups"],
  robots: { index: false },
};
}

export default async function TasksPage() {
  const ctx = await getCurrentAgentContext();

  // TasksClient fetches the unified task list (crm + playbook) on
  // mount via /api/dashboard/tasks/unified. We still SSR the contact
  // list so the "+ Add task" form's contact picker is populated
  // immediately without a flash.
  const { data: leads } = await supabaseServer
    .from("contacts")
    .select("id, name")
    .eq("agent_id", ctx.agentId)
    .limit(500);

  return (
    <TasksClient
      leads={(leads ?? []).map((l: { id: string | number; name: string | null }) => ({
        id: String(l.id),
        name: l.name,
      }))}
    />
  );
}
