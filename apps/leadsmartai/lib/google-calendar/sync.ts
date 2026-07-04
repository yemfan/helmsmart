import { supabaseServer } from "@/lib/supabaseServer";
import { encryptToken, decryptTokenLenient } from "@/lib/leads-gen/token-enc";
import { getGoogleOAuthConfig } from "./config";

type OAuthToken = {
  access_token: string;
  refresh_token: string | null;
  expires_at: string | null;
};

/**
 * Get a valid access token for an agent, refreshing if expired.
 */
async function getValidToken(agentId: string): Promise<string | null> {
  const { data } = await supabaseServer
    .from("agent_oauth_tokens")
    .select("access_token, refresh_token, expires_at")
    .eq("agent_id", agentId as any)
    .eq("provider", "google")
    .maybeSingle();

  if (!data) return null;
  const token = data as unknown as OAuthToken;
  // Tokens are stored AES-256-GCM encrypted; lenient decrypt tolerates any
  // legacy plaintext row until it's rewritten on the next refresh.
  const accessToken = decryptTokenLenient(token.access_token);
  const refreshToken = decryptTokenLenient(token.refresh_token);

  // Check if token is expired
  if (token.expires_at && new Date(token.expires_at).getTime() < Date.now() + 60_000) {
    if (!refreshToken) return null;

    // Refresh the token
    const { clientId, clientSecret } = getGoogleOAuthConfig();
    const res = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        refresh_token: refreshToken,
        grant_type: "refresh_token",
      }),
    });

    const body = await res.json();
    if (!res.ok || !body.access_token) return null;

    const newExpires = body.expires_in
      ? new Date(Date.now() + body.expires_in * 1000).toISOString()
      : null;

    await supabaseServer
      .from("agent_oauth_tokens")
      .update({
        access_token: encryptToken(body.access_token),
        expires_at: newExpires,
        updated_at: new Date().toISOString(),
      })
      .eq("agent_id", agentId as any)
      .eq("provider", "google");

    return body.access_token;
  }

  return accessToken;
}

/**
 * Low-level primitive: create or update a Google Calendar event via the
 * v3 API. No DB I/O — the caller passes in the prior Google event id (if
 * any) and persists the returned new id wherever it belongs. This is the
 * shared core for all our Google Calendar integrations.
 *
 * Returns { googleEventId: null } when:
 *   * The agent hasn't connected Google Calendar yet.
 *   * The token is expired + un-refreshable.
 *   * Google's API returned a non-2xx (logged + swallowed — calendar
 *     failures should never block the primary create/update).
 */
export async function upsertGoogleEvent(params: {
  agentId: string;
  existingGoogleEventId: string | null;
  title: string;
  description?: string;
  startAt: string; // ISO
  endAt: string; // ISO
  location?: string;
  timezone?: string;
}): Promise<{ googleEventId: string | null }> {
  const accessToken = await getValidToken(params.agentId);
  if (!accessToken) return { googleEventId: null };

  const tz = params.timezone || "America/Los_Angeles";
  const eventBody = {
    summary: params.title,
    description: params.description || "",
    location: params.location || undefined,
    start: { dateTime: params.startAt, timeZone: tz },
    end: { dateTime: params.endAt, timeZone: tz },
    reminders: { useDefault: true },
  };

  const existing = params.existingGoogleEventId;
  const method = existing ? "PUT" : "POST";
  const url = existing
    ? `https://www.googleapis.com/calendar/v3/calendars/primary/events/${existing}`
    : "https://www.googleapis.com/calendar/v3/calendars/primary/events";

  const res = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(eventBody),
  });

  if (!res.ok) {
    console.error("Google Calendar sync error:", res.status, await res.text().catch(() => ""));
    return { googleEventId: existing };
  }

  const result = await res.json();
  return { googleEventId: result.id || existing };
}

/**
 * Create or update a Google Calendar event for a lead_calendar_events
 * row. This is the original lead-system consumer — unchanged behavior.
 * Showings use `upsertGoogleEvent` directly with their own persistence.
 */
export async function syncEventToGoogle(params: {
  agentId: string;
  eventId: string;
  title: string;
  description?: string;
  startAt: string; // ISO
  endAt: string; // ISO
  timezone?: string;
}): Promise<{ googleEventId: string | null }> {
  // Look up any prior Google event id for this lead event row.
  const { data: existing } = await supabaseServer
    .from("lead_calendar_events")
    .select("external_event_id")
    .eq("id", params.eventId)
    .maybeSingle();
  const existingGoogleEventId = (existing as any)?.external_event_id ?? null;

  const { googleEventId } = await upsertGoogleEvent({
    agentId: params.agentId,
    existingGoogleEventId,
    title: params.title,
    description: params.description,
    startAt: params.startAt,
    endAt: params.endAt,
    timezone: params.timezone,
  });

  // Persist the Google event ID back to our DB when it changed.
  if (googleEventId && googleEventId !== existingGoogleEventId) {
    await supabaseServer
      .from("lead_calendar_events")
      .update({
        external_event_id: googleEventId,
        calendar_provider: "google",
        external_calendar_id: "primary",
      } as any)
      .eq("id", params.eventId);
  }

  return { googleEventId };
}

/**
 * Delete an event from Google Calendar.
 */
export async function deleteGoogleEvent(params: {
  agentId: string;
  googleEventId: string;
}): Promise<void> {
  const accessToken = await getValidToken(params.agentId);
  if (!accessToken) return;

  await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/primary/events/${params.googleEventId}`,
    {
      method: "DELETE",
      headers: { Authorization: `Bearer ${accessToken}` },
    }
  ).catch(() => {});
}

/**
 * Check if an agent has Google Calendar connected.
 */
export async function isGoogleCalendarConnected(agentId: string): Promise<boolean> {
  const { data } = await supabaseServer
    .from("agent_oauth_tokens")
    .select("id")
    .eq("agent_id", agentId as any)
    .eq("provider", "google")
    .maybeSingle();
  return Boolean(data);
}
