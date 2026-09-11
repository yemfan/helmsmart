import type { Metadata } from "next";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { getServerT } from "@/lib/i18n/server";
import { listRecurringTasks } from "@/lib/actions/recurring-tasks";
import { orgTimezone } from "@/lib/org-timezone";
import { RecurringTasksClient } from "./recurring-tasks-client";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getServerT("tasks");
  return { title: t("meta.recurringTasks") };
}

export default async function RecurringTasksPage() {
  const cookieStore = await cookies();
  const orgId = cookieStore.get("helmsmart-org-id")?.value ?? "";
  const supabase = await createClient();

  const [recurring, clientsRes, timeZone] = await Promise.all([
    listRecurringTasks(),
    supabase
      .from("clients")
      .select("id, first_name, last_name, company")
      .eq("organization_id", orgId)
      .order("first_name"),
    orgTimezone(orgId),
  ]);

  const clients = (clientsRes.data ?? []) as {
    id: string;
    first_name: string | null;
    last_name: string | null;
    company: string | null;
  }[];

  return <RecurringTasksClient initialRecurring={recurring} clients={clients} timeZone={timeZone} />;
}
