import type { Metadata } from "next";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import {
  defaultBusinessHours,
  type BusinessHours,
  type AppointmentType,
} from "@/lib/receptionist";
import { getServerT } from "@/lib/i18n/server";
import { safeTimezone } from "@repo/voice/datetime";
import { BookClient } from "./book-client";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getServerT("site");
  return { title: t("book.meta.title") };
}

export default async function BookPage() {
  const cookieStore = await cookies();
  const orgId = cookieStore.get("helmsmart-org-id")?.value;
  if (!orgId) redirect("/login?next=/calendar/book");

  const supabase = await createClient();

  const start = new Date().toISOString();
  const end = new Date(Date.now() + 15 * 86400000).toISOString();

  const [{ data: org }, { data: clients }, { data: apptTypes }, { data: events }] =
    await Promise.all([
      supabase
        .from("organizations")
        .select("business_hours, timezone")
        .eq("id", orgId)
        .single(),
      supabase
        .from("clients")
        .select("id, first_name, last_name, company")
        .eq("organization_id", orgId)
        .eq("status", "active")
        .order("last_name"),
      supabase
        .from("appointment_types")
        .select("id, name, duration_minutes, description, active, sort")
        .eq("organization_id", orgId)
        .eq("active", true)
        .order("sort"),
      supabase
        .from("events")
        .select("start_at, end_at")
        .eq("organization_id", orgId)
        .eq("completed", false)
        .gte("start_at", start)
        .lte("start_at", end),
    ]);

  const hours =
    (org?.business_hours as BusinessHours | null) ?? defaultBusinessHours();

  return (
    <BookClient
      clients={
        (clients ?? []) as {
          id: string;
          first_name: string | null;
          last_name: string | null;
          company: string | null;
        }[]
      }
      appointmentTypes={(apptTypes ?? []) as AppointmentType[]}
      businessHours={hours}
      existingEvents={
        (events ?? []) as { start_at: string; end_at: string | null }[]
      }
      timeZone={safeTimezone(org?.timezone as string | null)}
    />
  );
}
