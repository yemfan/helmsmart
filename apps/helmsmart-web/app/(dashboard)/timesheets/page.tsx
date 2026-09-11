import type { Metadata } from "next";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { getServerT } from "@/lib/i18n/server";
import { listTimeEntries, getActiveTimer, getTimeStats } from "@/lib/actions/time-entries";
import { listProjects } from "@/lib/actions/projects";
import { orgTimezone } from "@/lib/org-timezone";
import { addDays, calendarDate, mondayOf } from "@/lib/org-date";
import { TimerClient } from "./timer-client";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getServerT("projects");
  return { title: t("meta.timesheets") };
}

/** Monday–Sunday of the org's current week. */
function weekBounds(today: string) {
  const from = mondayOf(today);
  return { from, to: addDays(from, 6) };
}

export default async function TimesheetsPage() {
  const cookieStore = await cookies();
  const orgId = cookieStore.get("helmsmart-org-id")?.value ?? "";
  const supabase = await createClient();

  const timeZone = await orgTimezone(orgId);
  const { from, to } = weekBounds(calendarDate(timeZone));

  const [entries, activeTimer, stats, clientsRes, orgRes, projects] = await Promise.all([
    listTimeEntries({ from, to }),
    getActiveTimer(),
    getTimeStats(from, to),
    supabase
      .from("clients")
      .select("id, first_name, last_name, company")
      .eq("organization_id", orgId)
      .order("first_name"),
    supabase
      .from("organizations")
      .select("default_hourly_rate")
      .eq("id", orgId)
      .single(),
    listProjects("active"),
  ]);

  const clients = (clientsRes.data ?? []) as {
    id: string;
    first_name: string | null;
    last_name: string | null;
    company: string | null;
  }[];

  const defaultHourlyRate = Number(orgRes.data?.default_hourly_rate ?? 0) || null;

  return (
    <TimerClient
      initialEntries={entries}
      initialActiveTimer={activeTimer}
      initialStats={stats}
      clients={clients}
      projects={projects.map((p) => ({ id: p.id, name: p.name, color: p.color }))}
      defaultHourlyRate={defaultHourlyRate}
      weekFrom={from}
      weekTo={to}
      timeZone={timeZone}
    />
  );
}
