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

  if (error) {
    // Logged in full; the caller shows its own copy. A Postgres sentence is
    // English and names nothing the owner can act on.
    console.error("[createEvent] insert failed:", error.message);
    throw new Error((await getServerT("tasks"))("errors.eventCreateFailed"));
  }

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

// Delete and complete return a result, and ask for their rows back: through
// the RLS client a refused write matches zero rows and is not an error, so the
// calendar closed the event as if it were done while the row stood unchanged.

export async function deleteEvent(eventId: string): Promise<{ ok: boolean; error?: string }> {
  const t = await getServerT("tasks");
  const cookieStore = await cookies();
  const orgId = cookieStore.get("helmsmart-org-id")?.value;
  if (!orgId) return { ok: false, error: t("errors.noOrg") };

  const supabase = await createClient();

  // Fetch event to get google_event_id before deleting
  const { data: event } = await supabase
    .from("events")
    .select("google_event_id")
    .eq("id", eventId)
    .eq("organization_id", orgId)
    .maybeSingle();

  // Delete from Supabase
  const { data: deleted, error } = await supabase
    .from("events")
    .delete()
    .eq("id", eventId)
    .eq("organization_id", orgId)
    .select("id");
  if (error) {
    console.error("[deleteEvent] delete failed:", error.message);
    return { ok: false, error: t("errors.eventFailed") };
  }
  if (!deleted || deleted.length === 0) return { ok: false, error: t("errors.eventRefused") };

  // Delete from Google Calendar if synced — only once our own row is gone.
  if (event?.google_event_id) {
    try {
      await deleteGoogleEvent(orgId, event.google_event_id);
    } catch (syncError) {
      // Log sync error but don't fail event deletion
      console.error("[deleteEvent] Google Calendar delete failed:", syncError);
    }
  }

  revalidatePath("/calendar");
  return { ok: true };
}

export async function toggleEventComplete(
  eventId: string,
  completed: boolean,
): Promise<{ ok: boolean; error?: string }> {
  const t = await getServerT("tasks");
  const cookieStore = await cookies();
  const orgId = cookieStore.get("helmsmart-org-id")?.value;
  if (!orgId) return { ok: false, error: t("errors.noOrg") };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("events")
    .update({ completed, updated_at: new Date().toISOString() })
    .eq("id", eventId)
    .eq("organization_id", orgId)
    .select("id");
  if (error) {
    console.error("[toggleEventComplete] update failed:", error.message);
    return { ok: false, error: t("errors.eventFailed") };
  }
  if (!data || data.length === 0) return { ok: false, error: t("errors.eventRefused") };

  revalidatePath("/calendar");
  return { ok: true };
}
