import "server-only";

import { HUB_EVENT_TYPES } from "@/lib/marketing-hub/events";
import { buildGaReport, cachedGaReport, gaPropertyId, matchGaProperty, type GaProperty, type GaReport, type RunReportResponse } from "@/lib/marketing-hub/gaReport";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { decryptToken, encryptToken } from "./token-enc";
import { exchangeCodeForToken, refreshAccessToken } from "./youtube-oauth";

/**
 * Google Analytics 4, read-only, for the marketing page.
 *
 * Same Google OAuth client as YouTube (one platform-level app; each agent
 * authorises their own account), a narrower scope, and a row on
 * social_accounts with platform = 'google'. Two Google APIs:
 *
 *   Admin API   which properties the account can see, and the measurement
 *               id on each web stream — to find the hub's property;
 *   Data API    runReport, three times per window: channels, hub pages,
 *               hub events.
 *
 * Both must be enabled on the Google Cloud project, and the consent screen
 * must list analytics.readonly, or every call here fails with 403.
 */

export const GA_OAUTH_SCOPES = ["https://www.googleapis.com/auth/analytics.readonly"] as const;

const ADMIN = "https://analyticsadmin.googleapis.com/v1beta";
const DATA = "https://analyticsdata.googleapis.com/v1beta";

/** Web streams are read for at most this many properties at connect time. */
const MAX_PROPERTIES_FOR_STREAMS = 25;

async function google<T>(url: string, accessToken: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json", ...(init?.headers ?? {}) },
  });
  const json = (await res.json().catch(() => ({}))) as T & { error?: { message?: string; status?: string } };
  if (!res.ok) {
    const err = new Error(json?.error?.message || `Google API ${res.status}`) as Error & { status?: number };
    err.status = res.status;
    throw err;
  }
  return json;
}

// ── Properties ───────────────────────────────────────────────────────────────

type AccountSummaries = {
  accountSummaries?: { propertySummaries?: { property?: string; displayName?: string }[] }[];
  nextPageToken?: string;
};
type DataStreams = { dataStreams?: { type?: string; webStreamData?: { measurementId?: string } }[] };

/** Every GA4 property the authorising account can read, with its web measurement ids. */
export async function listGaProperties(accessToken: string): Promise<GaProperty[]> {
  const props: GaProperty[] = [];
  let pageToken: string | undefined;
  do {
    const q = new URLSearchParams({ pageSize: "200", ...(pageToken ? { pageToken } : {}) });
    const page = await google<AccountSummaries>(`${ADMIN}/accountSummaries?${q}`, accessToken);
    for (const acc of page.accountSummaries ?? []) {
      for (const p of acc.propertySummaries ?? []) {
        const id = gaPropertyId(p.property);
        if (id && !props.some((x) => x.id === id)) props.push({ id, name: String(p.displayName ?? id), measurementIds: [] });
      }
    }
    pageToken = page.nextPageToken || undefined;
  } while (pageToken && props.length < 500);

  await Promise.all(
    props.slice(0, MAX_PROPERTIES_FOR_STREAMS).map(async (p) => {
      try {
        const s = await google<DataStreams>(`${ADMIN}/properties/${p.id}/dataStreams`, accessToken);
        p.measurementIds = (s.dataStreams ?? [])
          .map((d) => d.webStreamData?.measurementId?.trim())
          .filter((m): m is string => Boolean(m));
      } catch {
        // A property we cannot list streams for is still a property; it just cannot be auto-matched.
      }
    }),
  );
  return props;
}

// ── Report ───────────────────────────────────────────────────────────────────

const METRICS = [{ name: "sessions" }, { name: "totalUsers" }, { name: "screenPageViews" }, { name: "keyEvents" }];

/** The three runReport calls for one window, combined. `hubPath` is "/@handle". */
export async function runGaReport(accessToken: string, propertyId: string, days: number, hubPath: string | null): Promise<GaReport> {
  const dateRanges = [{ startDate: `${Math.max(1, Math.floor(days))}daysAgo`, endDate: "today" }];
  const run = (body: Record<string, unknown>) =>
    google<RunReportResponse>(`${DATA}/properties/${propertyId}:runReport`, accessToken, { method: "POST", body: JSON.stringify({ dateRanges, ...body }) });

  const [channels, hub, events] = await Promise.all([
    run({
      dimensions: [{ name: "sessionDefaultChannelGroup" }],
      metrics: METRICS,
      metricAggregations: ["TOTAL"],
      orderBys: [{ metric: { metricName: "sessions" }, desc: true }],
      limit: 12,
    }),
    hubPath
      ? run({
          metrics: METRICS,
          dimensionFilter: { filter: { fieldName: "pagePath", stringFilter: { matchType: "BEGINS_WITH", value: hubPath, caseSensitive: false } } },
        })
      : Promise.resolve(null),
    run({
      dimensions: [{ name: "eventName" }],
      metrics: [{ name: "eventCount" }],
      dimensionFilter: { filter: { fieldName: "eventName", inListFilter: { values: [...HUB_EVENT_TYPES] } } },
      limit: 50,
    }),
  ]);
  return buildGaReport({ channels, hub, events });
}

// ── Token ────────────────────────────────────────────────────────────────────

export type GoogleConn = {
  id: string;
  user_access_token_enc: string | null;
  google_refresh_token_enc: string | null;
  user_token_expires_at: string | null;
};

/** A currently-valid access token, refreshing within 2 min of expiry. Mirrors ensureYouTubeAccessToken. */
export async function ensureGoogleAccessToken(conn: GoogleConn): Promise<string> {
  const current = conn.user_access_token_enc ? decryptToken(conn.user_access_token_enc) : "";
  const expMs = conn.user_token_expires_at ? Date.parse(conn.user_token_expires_at) : 0;
  if (current && expMs && expMs - Date.now() > 120_000) return current;
  if (!conn.google_refresh_token_enc) {
    if (current) return current;
    const err = new Error("Google token expired") as Error & { status?: number };
    err.status = 401;
    throw err;
  }
  const t = await refreshAccessToken(decryptToken(conn.google_refresh_token_enc));
  const nowIso = new Date().toISOString();
  await supabaseAdmin
    .from("social_accounts")
    .update({
      user_access_token_enc: encryptToken(t.accessToken),
      google_refresh_token_enc: t.refreshToken ? encryptToken(t.refreshToken) : conn.google_refresh_token_enc,
      user_token_expires_at: new Date(Date.now() + t.expiresIn * 1000).toISOString(),
      last_refreshed_at: nowIso,
      updated_at: nowIso,
    } as never)
    .eq("id", conn.id);
  return t.accessToken;
}

/** Google's own wording for a dead grant, so the row can be marked expired rather than errored. */
export function isGoogleAuthFailure(e: unknown): boolean {
  const status = (e as { status?: number } | null)?.status;
  const msg = e instanceof Error ? e.message.toLowerCase() : "";
  return status === 401 || msg.includes("invalid_grant") || msg.includes("token expired") || msg.includes("unauthenticated");
}

// ── Connect ──────────────────────────────────────────────────────────────────

/**
 * Finish the OAuth flow for Google Analytics: exchange the code, list the
 * properties this account can see, pick the hub's when it can be picked,
 * and keep one social_accounts row (platform = 'google') for the agent.
 * Returns what the callback needs to send the agent back with the truth.
 */
export async function completeGaConnection(agentId: string, code: string): Promise<{ propertyName: string | null; propertyCount: number }> {
  const token = await exchangeCodeForToken(code);
  const properties = await listGaProperties(token.accessToken);

  const { data: tracking } = await supabaseAdmin
    .from("agent_tracking_config")
    .select("ga_measurement_id")
    .eq("agent_id", agentId as never)
    .maybeSingle();
  const measurementId = (tracking as { ga_measurement_id?: string | null } | null)?.ga_measurement_id ?? null;
  const picked = matchGaProperty(properties, measurementId);

  const nowIso = new Date().toISOString();
  const row = {
    agent_id: agentId,
    platform: "google",
    account_display_name: picked?.name ?? "Google Analytics",
    ga_property_id: picked?.id ?? null,
    ga_property_name: picked?.name ?? null,
    ga_properties: properties,
    // A new authorisation means whatever was cached belongs to the old property.
    ga_metrics: null,
    ga_metrics_refreshed_at: null,
    user_access_token_enc: encryptToken(token.accessToken),
    google_refresh_token_enc: token.refreshToken ? encryptToken(token.refreshToken) : null,
    user_token_expires_at: new Date(Date.now() + token.expiresIn * 1000).toISOString(),
    scopes: [...GA_OAUTH_SCOPES],
    status: "connected",
    last_error: null,
    last_refreshed_at: nowIso,
    updated_at: nowIso,
  };

  // Manual upsert — the unique index is PARTIAL (WHERE platform = 'google').
  const { data: existing } = await supabaseAdmin
    .from("social_accounts")
    .select("id, google_refresh_token_enc")
    .eq("agent_id", agentId as never)
    .eq("platform", "google")
    .maybeSingle();
  const prior = existing as { id: string; google_refresh_token_enc: string | null } | null;
  if (prior?.id) {
    const { error } = await supabaseAdmin
      .from("social_accounts")
      // Google only returns a refresh token on first consent; keep the stored one otherwise.
      .update({ ...row, google_refresh_token_enc: row.google_refresh_token_enc ?? prior.google_refresh_token_enc } as never)
      .eq("id", prior.id);
    if (error) throw new Error(error.message);
  } else {
    const { error } = await supabaseAdmin.from("social_accounts").insert({ ...row, connected_at: nowIso } as never);
    if (error) throw new Error(error.message);
  }
  return { propertyName: picked?.name ?? null, propertyCount: properties.length };
}

// ── The marketing page's block ───────────────────────────────────────────────

export type GaBlock = {
  connected: boolean;
  property: { id: string; name: string } | null;
  /** What the account can see, for the picker when no property is chosen. */
  properties: { id: string; name: string }[];
  report: GaReport | null;
  refreshedAt: string | null;
  /** expired = reconnect; read_failed = Google answered with an error (last_error has it). */
  error: "expired" | "read_failed" | null;
};

const REPORT_MAX_AGE_MS = 55 * 60 * 1000;

type GaRow = GoogleConn & {
  status: string;
  ga_property_id: string | null;
  ga_property_name: string | null;
  ga_properties: unknown;
  ga_metrics: unknown;
};

/**
 * The agent's Google Analytics numbers for one window, from cache when it
 * is under an hour old, otherwise fresh from Google and cached. A read that
 * fails keeps the last good report on screen and says why the new one did
 * not come. Every read is by agent id.
 */
export async function loadGaBlock(agentId: string, days: number, hubPath: string | null): Promise<GaBlock> {
  const none: GaBlock = { connected: false, property: null, properties: [], report: null, refreshedAt: null, error: null };
  const { data } = await supabaseAdmin
    .from("social_accounts")
    .select("id, status, ga_property_id, ga_property_name, ga_properties, ga_metrics, user_access_token_enc, google_refresh_token_enc, user_token_expires_at")
    .eq("agent_id", agentId as never)
    .eq("platform", "google")
    .maybeSingle();
  const row = data as GaRow | null;
  if (!row) return none;

  const properties = (Array.isArray(row.ga_properties) ? (row.ga_properties as GaProperty[]) : []).map((p) => ({ id: p.id, name: p.name }));
  const base: GaBlock = { ...none, connected: true, properties };
  if (row.status !== "connected") return { ...base, error: "expired" };
  if (!row.ga_property_id) return base;
  const property = { id: row.ga_property_id, name: row.ga_property_name ?? row.ga_property_id };

  const cached = cachedGaReport(row.ga_metrics, days, Date.now(), REPORT_MAX_AGE_MS);
  if (cached?.fresh) return { ...base, property, report: cached.report, refreshedAt: cached.refreshedAt };

  try {
    const token = await ensureGoogleAccessToken(row);
    const report = await runGaReport(token, property.id, days, hubPath);
    const refreshedAt = new Date().toISOString();
    const cache = row.ga_metrics && typeof row.ga_metrics === "object" ? (row.ga_metrics as Record<string, unknown>) : {};
    await supabaseAdmin
      .from("social_accounts")
      .update({ ga_metrics: { ...cache, [String(days)]: { report, refreshedAt } }, ga_metrics_refreshed_at: refreshedAt, last_error: null, updated_at: refreshedAt } as never)
      .eq("id", row.id);
    return { ...base, property, report, refreshedAt };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    const expired = isGoogleAuthFailure(e);
    console.warn("[google-analytics] read failed:", msg);
    await supabaseAdmin
      .from("social_accounts")
      .update({ ...(expired ? { status: "expired" } : {}), last_error: msg.slice(0, 500), updated_at: new Date().toISOString() } as never)
      .eq("id", row.id);
    return { ...base, property, report: cached?.report ?? null, refreshedAt: cached?.refreshedAt ?? null, error: expired ? "expired" : "read_failed" };
  }
}
