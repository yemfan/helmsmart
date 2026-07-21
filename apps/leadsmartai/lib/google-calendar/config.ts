export function getGoogleOAuthConfig() {
  const clientId = process.env.GOOGLE_CALENDAR_CLIENT_ID?.trim() || "";
  const clientSecret = process.env.GOOGLE_CALENDAR_CLIENT_SECRET?.trim() || "";
  const baseUrl = (process.env.NEXT_PUBLIC_APP_URL || process.env.APP_BASE_URL || "https://www.closebossai.com").replace(/\/$/, "");
  const redirectUri = `${baseUrl}/api/auth/google-calendar/callback`;

  return { clientId, clientSecret, redirectUri, baseUrl };
}

export const GOOGLE_CALENDAR_SCOPES = [
  "https://www.googleapis.com/auth/calendar.events",
  "https://www.googleapis.com/auth/calendar.readonly",
].join(" ");

export function isGoogleCalendarConfigured(): boolean {
  const { clientId, clientSecret } = getGoogleOAuthConfig();
  return Boolean(clientId && clientSecret);
}
