import { Metadata } from "next";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { CalendarGrid } from "@/components/calendar-grid";
import { getServerT } from "@/lib/i18n/server";
import { orgTimezone } from "@/lib/org-timezone";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getServerT("tasks");
  return { title: t("meta.calendar") };
}

export default async function CalendarPage() {
  const cookieStore = await cookies();
  const orgId = cookieStore.get("helmsmart-org-id")?.value ?? "";
  const supabase = await createClient();

  // Load events for ±1 month before + 3 months after now
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth() - 1, 1).toISOString();
  const end   = new Date(now.getFullYear(), now.getMonth() + 3, 0).toISOString();

  const [timeZone, { data: events }, { data: clients }] = await Promise.all([
    orgTimezone(orgId),
    supabase
      .from("events")
      .select(`id, title, type, color, start_at, end_at, all_day, completed, client_id, google_event_id,
               clients(first_name, last_name)`)
      .eq("organization_id", orgId)
      .gte("start_at", start)
      .lte("start_at", end)
      .order("start_at"),
    supabase
      .from("clients")
      .select("id, first_name, last_name")
      .eq("organization_id", orgId)
      .order("last_name"),
  ]);

  type CalEvent = {
    id: string;
    title: string;
    type: "appointment" | "task" | "meeting" | "reminder";
    color: "indigo" | "emerald" | "rose" | "amber" | "slate";
    start_at: string;
    end_at: string | null;
    all_day: boolean;
    completed: boolean;
    client_id: string | null;
    google_event_id: string | null;
    clients: { first_name: string | null; last_name: string | null } | null;
  };

  const safeEvents: CalEvent[] = (events ?? []).map((e) => {
    const clientRaw = e.clients;
    const client = (Array.isArray(clientRaw) ? clientRaw[0] : clientRaw) as {
      first_name: string | null; last_name: string | null;
    } | null;
    return {
      id: e.id,
      title: e.title,
      type: e.type as CalEvent["type"],
      color: e.color as CalEvent["color"],
      start_at: e.start_at,
      end_at: e.end_at,
      all_day: e.all_day,
      completed: e.completed,
      client_id: e.client_id,
      google_event_id: e.google_event_id,
      clients: client,
    };
  });

  return (
    <div className="flex flex-col h-full">
      <CalendarGrid
        events={safeEvents}
        clients={(clients ?? []) as { id: string; first_name: string | null; last_name: string | null }[]}
        timeZone={timeZone}
      />
    </div>
  );
}
