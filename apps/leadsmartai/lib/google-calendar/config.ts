export function getGoogleOAuthConfig() {
  const clientId = process.env.GOOGLE_CALENDAR_CLIENT_ID?.trim() || "";
  const clientSecret = process.env.GOOGLE_CALENDAR_CLIENT_SECRET?.trim() || "";
  const baseUrl = (process.env.NEXT_PUBLIC_APP_URL || process.env.APP_BASE_URL || "https://www.closebossai.com").replace(/\/$/, "");
  const redirectUri = `${baseUrl}/api/auth/google-calendar/callback`;

  return { clientId, clientSecret, redirectUri, baseUrl };
}

/**
 * The ONE scope this integration needs.
 *
 * `sync.ts` makes exactly three Calendar calls, all writes against the user's
 * primary calendar: events.insert / events.update / events.delete. Nothing
 * anywhere reads or lists calendars or events.
 *
 * `calendar.readonly` used to be requested alongside it and was never once
 * exercised. Asking for an unused sensitive scope costs real things: it widens
 * the consent screen ("See and download any calendar you can access") for a
 * capability we don't have, and Google's verification review rejects scopes an
 * app cannot demonstrate it uses. Keep this list equal to what the code calls.
 */
export const GOOGLE_CALENDAR_SCOPES = [
  "https://www.googleapis.com/auth/calendar.events",
].join(" ");

export function isGoogleCalendarConfigured(): boolean {
  const { clientId, clientSecret } = getGoogleOAuthConfig();
  return Boolean(clientId && clientSecret);
}
