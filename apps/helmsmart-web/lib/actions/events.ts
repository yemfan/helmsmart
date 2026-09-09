"use server";

import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { getServerT } from "@/lib/i18n/server";
import { revalidatePath } from "next/cache";
import { syncEventToGoogle, deleteGoogleEvent, isGoogleCalendarConnected } from "@/lib/google-calendar";

export async function createEvent(data: {
  title: string;
  description?: string;
  location?: string;
  type: "appointment" | "task" | "meeting" | "reminder";
  color: "indigo" | "emerald" | "rose" | "amber" | "slate";
  startAt: string;   // ISO string
  endAt?: string;
  allDay: boolean;
  clientId?: string | null;
}) {
  const cookieStore = await cookies();
  const orgId = cookieStore.get("helmsmart-org-id")?.value;
  if (!orgId) throw new Error((await getServerT("tasks"))("errors.noOrg"));

  const supabase = await createClient();
  const { data: insertedEvent, error } = await supabase.from("events").insert({
    organization_id: orgId,
    client_id: data.clientId ?? null,
    title: data.title,
    description: data.description ?? null,
    location: data.location ?? null,
    type: data.type,
    color: data.color,
    start_at: data.startAt,
    end_at: data.endAt ?? null,
    all_day: data.allDay,
  }).select("id").single();

  if (error) throw new Error(error.message);

  // Sync to Google Calendar if connected
  const connected = await isGoogleCalendarConnected(orgId);
  if (connected && insertedEvent) {
    try {
      const syncResult = await syncEventToGoogle({
        orgId,
        title: data.title,
        description: data.description,
        startAt: data.startAt,
        endAt: data.endAt,
        allDay: data.allDay,
      });

      // Update event with google_event_id if sync succeeded
      if (syncResult.googleEventId) {
        await supabase
          .from("events")
          .update({ google_event_id: syncResult.googleEventId })
          .eq("id", insertedEvent.id)
          .eq("organization_id", orgId);
      }
    } catch (syncError) {
      // Log sync error but don't fail event creation
      console.error("[createEvent] Google Calendar sync failed:", syncError);
    }
  }

  revalidatePath("/calendar");
}

export async function updateEvent(
  eventId: string,
  data: Partial<{
    title: string;
    description: string;
    location: string;
    type: string;
    color: string;
    start_at: string;
    end_at: string;
    all_day: boolean;
    completed: boolean;
    client_id: string | null;
  }>
) {
  const cookieStore = await cookies();
  const orgId = cookieStore.get("helmsmart-org-id")?.value;
  if (!orgId) throw new Error((await getServerT("tasks"))("errors.noOrg"));

  const supabase = await createClient();

  // Fetch current event to get google_event_id if we need to sync
  const { data: currentEvent } = await supabase
    .from("events")
    .select("google_event_id, title, start_at, end_at, all_day, description")
    .eq("id", eventId)
    .eq("organization_id", orgId)
    .maybeSingle();

  // Update event
  await supabase
    .from("events")
    .update({ ...data, updated_at: new Date().toISOString() })
    .eq("id", eventId)
    .eq("organization_id", orgId);

  // Sync to Google Calendar if event has google_event_id and relevant fields changed
  if (currentEvent?.google_event_id && (data.title || data.start_at || data.end_at || data.all_day !== undefined)) {
    try {
      await syncEventToGoogle({
        orgId,
        googleEventId: currentEvent.google_event_id,
        title: data.title || currentEvent.title,
        description: data.description || currentEvent.description,
        startAt: data.start_at || currentEvent.start_at,
        endAt: data.end_at || currentEvent.end_at,
        allDay: data.all_day !== undefined ? data.all_day : currentEvent.all_day,
      });
    } catch (syncError) {
      // Log sync error but don't fail event update
      console.error("[updateEvent] Google Calendar sync failed:", syncError);
    }
  }

  revalidatePath("/calendar");
}

export async function deleteEvent(eventId: string) {
  const cookieStore = await cookies();
  const orgId = cookieStore.get("helmsmart-org-id")?.value;
  if (!orgId) throw new Error((await getServerT("tasks"))("errors.noOrg"));

  const supabase = await createClient();

  // Fetch event to get google_event_id before deleting
  const { data: event } = await supabase
    .from("events")
    .select("google_event_id")
    .eq("id", eventId)
    .eq("organization_id", orgId)
    .maybeSingle();

  // Delete from Supabase
  await supabase
    .from("events")
    .delete()
    .eq("id", eventId)
    .eq("organization_id", orgId);

  // Delete from Google Calendar if synced
  if (event?.google_event_id) {
    try {
      await deleteGoogleEvent(orgId, event.google_event_id);
    } catch (syncError) {
      // Log sync error but don't fail event deletion
      console.error("[deleteEvent] Google Calendar delete failed:", syncError);
    }
  }

  revalidatePath("/calendar");
}

export async function toggleEventComplete(eventId: string, completed: boolean) {
  const cookieStore = await cookies();
  const orgId = cookieStore.get("helmsmart-org-id")?.value;
  if (!orgId) throw new Error((await getServerT("tasks"))("errors.noOrg"));

  const supabase = await createClient();
  await supabase
    .from("events")
    .update({ completed, updated_at: new Date().toISOString() })
    .eq("id", eventId)
    .eq("organization_id", orgId);

  revalidatePath("/calendar");
}
