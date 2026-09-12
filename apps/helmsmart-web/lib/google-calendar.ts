import { createServiceClient } from "@/lib/supabase/server";
import { addDays, calendarDate } from "@/lib/org-date";
import { safeTimezone } from "@repo/voice/datetime";

// Per-org Google Calendar integration — OAuth token refresh, event upsert/delete,
// and free/busy availability. Mirrors LeadSmart's lib/google-calendar but keyed
// per organization. Token I/O uses the service client so it works in webhook /
// voice-tool contexts (no cookie).

export function getGoogleCalendarConfig() {
  const clientId = process.env.GOOGLE_CALENDAR_CLIENT_ID?.trim() || "";
  const clientSecret = process.env.GOOGLE_CALENDAR_CLIENT_SECRET?.trim() || "";
  const baseUrl = (process.env.NEXT_PUBLIC_APP_URL || "").replace(/\/$/, "");
  const redirectUri = `${baseUrl}/api/auth/google-calendar/callback`;
  return { clientId, clientSecret, baseUrl, redirectUri };
}

export const GOOGLE_CALENDAR_SCOPES = [
  "https://www.googleapis.com/auth/calendar.events",
  "https://www.googleapis.com/auth/calendar.readonly",
].join(" ");

export function isGoogleCalendarConfigured(): boolean {
  const { clientId, clientSecret } = getGoogleCalendarConfig();
  return Boolean(clientId && clientSecret);
}

type TokenRow = { access_token: string; refresh_token: string | null; expires_at: string | null };

/** A valid access token for the org, refreshing if near expiry. null if not connected. */
async function getValidToken(orgId: string): Promise<string | null> {
  const db = await createServiceClient();
  const { data } = await db
    .from("org_oauth_tokens")
    .select("access_token, refresh_token, expires_at")
    .eq("organization_id", orgId)
    .eq("provider", "google")
    .maybeSingle();
  if (!data) return null;
  const token = data as TokenRow;

  if (token.expires_at && new Date(token.expires_at).getTime() < Date.now() + 60_000) {
    if (!token.refresh_token) return null;
    const { clientId, clientSecret } = getGoogleCalendarConfig();
    const res = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        refresh_token: token.refresh_token,
        grant_type: "refresh_token",
      }),
    });
    const body = await res.json();
    if (!res.ok || !body.access_token) return null;
    const newExpires = body.expires_in
      ? new Date(Date.now() + body.expires_in * 1000).toISOString()
      : null;
    await db
      .from("org_oauth_tokens")
      .update({ access_token: body.access_token, expires_at: newExpires, updated_at: new Date().toISOString() })
      .eq("organization_id", orgId)
      .eq("provider", "google");
    return body.access_token;
  }
  return token.access_token;
}

export async function isGoogleCalendarConnected(orgId: string): Promise<boolean> {
  const db = await createServiceClient();
  const { data } = await db
    .from("org_oauth_tokens")
    .select("id")
    .eq("organization_id", orgId)
    .eq("provider", "google")
    .maybeSingle();
  return Boolean(data);
}

export async function getConnectedGoogleAccount(orgId: string): Promise<string | null> {
  const db = await createServiceClient();
  const { data } = await db
    .from("org_oauth_tokens")
    .select("account_email")
    .eq("organization_id", orgId)
    .eq("provider", "google")
    .maybeSingle();
  return (data?.account_email as string | null) ?? null;
}

/** Create or update an event on the org's primary Google Calendar. */
export async function upsertGoogleEvent(params: {
  orgId: string;
  existingGoogleEventId?: string | null;
  title: string;
  description?: string;
  startAt: string; // ISO
  endAt: string; // ISO
  timezone?: string;
}): Promise<{ googleEventId: string | null }> {
  const accessToken = await getValidToken(params.orgId);
  if (!accessToken) return { googleEventId: null };

  const tz = params.timezone || "America/New_York";
  const eventBody = {
    summary: params.title,
    description: params.description || "",
    start: { dateTime: params.startAt, timeZone: tz },
    end: { dateTime: params.endAt, timeZone: tz },
    reminders: { useDefault: true },
  };
  const existing = params.existingGoogleEventId;
  const url = existing
    ? `https://www.googleapis.com/calendar/v3/calendars/primary/events/${existing}`
    : "https://www.googleapis.com/calendar/v3/calendars/primary/events";
  const res = await fetch(url, {
    method: existing ? "PUT" : "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify(eventBody),
  });
  if (!res.ok) {
    console.error("[gcal] event upsert error:", res.status, await res.text().catch(() => ""));
    return { googleEventId: existing ?? null };
  }
  const result = await res.json();
  return { googleEventId: result.id || existing || null };
}

export async function deleteGoogleEvent(orgId: string, googleEventId: string): Promise<void> {
  const accessToken = await getValidToken(orgId);
  if (!accessToken) return;
  await fetch(`https://www.googleapis.com/calendar/v3/calendars/primary/events/${googleEventId}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${accessToken}` },
  }).catch(() => {});
}

/** Sync a HelmSmart event to Google Calendar (create or update).
 *  Converts all_day and ISO datetime formats. Returns google_event_id or null if not synced. */
export async function syncEventToGoogle(params: {
  orgId: string;
  googleEventId?: string | null;
  title: string;
  description?: string;
  startAt: string; // ISO instant
  endAt?: string | null; // ISO instant
  allDay: boolean;
  /** `organizations.timezone` — whose clock Google should show this in. */
  timeZone?: string;
}): Promise<{ googleEventId: string | null }> {
  const accessToken = await getValidToken(params.orgId);
  if (!accessToken) return { googleEventId: params.googleEventId || null };

  // The business's zone, not a hardcoded one: an org in Los Angeles had its
  // events written to Google as New York times.
  const tz = safeTimezone(params.timeZone);

  // Convert all_day events to Google's date format (YYYY-MM-DD)
  // For all_day events, endAt should be exclusive (next day)
  let startSpec: Record<string, string>;
  let endSpec: Record<string, string>;

  if (params.allDay) {
    // The day this instant falls on in the org's zone — an all-day event is
    // stored as local midnight, which in UTC can be the day before.
    const dateStr = calendarDate(tz, new Date(params.startAt));
    startSpec = { date: dateStr };

    // For all-day events, end date should be the day after — as date-string
    // math, so it is right whatever timezone the server runs in.
    endSpec = { date: addDays(dateStr, 1) };
  } else {
    startSpec = { dateTime: params.startAt, timeZone: tz };
    endSpec = { dateTime: params.endAt || params.startAt, timeZone: tz };
  }

  const eventBody = {
    summary: params.title,
    description: params.description || "",
    start: startSpec,
    end: endSpec,
    reminders: { useDefault: true },
  };

  const existing = params.googleEventId;
  const url = existing
    ? `https://www.googleapis.com/calendar/v3/calendars/primary/events/${existing}`
    : "https://www.googleapis.com/calendar/v3/calendars/primary/events";

  try {
    const res = await fetch(url, {
      method: existing ? "PUT" : "POST",
      headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify(eventBody),
    });

    if (!res.ok) {
      console.error("[gcal] event sync error:", res.status, await res.text().catch(() => ""));
      return { googleEventId: existing ?? null };
    }

    const result = await res.json();
    return { googleEventId: result.id || existing || null };
  } catch (error) {
    console.error("[gcal] event sync exception:", error);
    return { googleEventId: existing ?? null };
  }
}

export type BusyInterval = { start: string; end: string };

/** Busy intervals on the org's primary calendar between timeMin/timeMax (ISO).
 *  null = not connected (caller falls back to the internal events table). */
export async function getGoogleFreeBusy(
  orgId: string,
  timeMin: string,
  timeMax: string
): Promise<BusyInterval[] | null> {
  const accessToken = await getValidToken(orgId);
  if (!accessToken) return null;
  const res = await fetch("https://www.googleapis.com/calendar/v3/freeBusy", {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({ timeMin, timeMax, items: [{ id: "primary" }] }),
  });
  if (!res.ok) {
    console.error("[gcal] freebusy error:", res.status);
    return null;
  }
  const data = await res.json();
  const busy = data?.calendars?.primary?.busy;
  return Array.isArray(busy) ? (busy as BusyInterval[]) : [];
}
