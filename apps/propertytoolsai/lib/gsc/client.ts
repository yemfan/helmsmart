/**
 * Thin Google Search Console (Search Analytics API v3) client.
 * Uses the OAuth access token from ./auth. Node runtime, global fetch only.
 */

import { getGscAccessToken } from "./auth";

const WEBMASTERS_BASE = "https://www.googleapis.com/webmasters/v3";

export type GscSite = { siteUrl: string; permissionLevel: string };

export async function listGscSites(): Promise<GscSite[]> {
  const token = await getGscAccessToken();
  const res = await fetch(`${WEBMASTERS_BASE}/sites`, {
    method: "GET",
    headers: { Authorization: `Bearer ${token}` },
  });

  const text = await res.text();
  if (!res.ok) {
    throw new Error(`GSC listSites failed (${res.status}): ${text}`);
  }

  let json: { siteEntry?: Array<{ siteUrl?: string; permissionLevel?: string }> };
  try {
    json = JSON.parse(text) as {
      siteEntry?: Array<{ siteUrl?: string; permissionLevel?: string }>;
    };
  } catch {
    throw new Error(`GSC listSites returned non-JSON response: ${text}`);
  }

  return (json.siteEntry ?? [])
    .filter((s): s is { siteUrl: string; permissionLevel?: string } => Boolean(s.siteUrl))
    .map((s) => ({
      siteUrl: s.siteUrl,
      permissionLevel: s.permissionLevel ?? "unknown",
    }));
}

export type SearchAnalyticsBody = {
  startDate: string;
  endDate: string;
  dimensions: string[];
  rowLimit?: number;
  dataState?: string;
  startRow?: number;
};

export type SearchAnalyticsRow = {
  keys?: string[];
  clicks?: number;
  impressions?: number;
  ctr?: number;
  position?: number;
};

export async function searchAnalyticsQuery(
  siteUrl: string,
  body: SearchAnalyticsBody
): Promise<{ rows: SearchAnalyticsRow[] }> {
  const token = await getGscAccessToken();
  const res = await fetch(
    `${WEBMASTERS_BASE}/sites/${encodeURIComponent(siteUrl)}/searchAnalytics/query`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    }
  );

  const text = await res.text();
  if (!res.ok) {
    throw new Error(`GSC searchAnalytics query failed (${res.status}) for ${siteUrl}: ${text}`);
  }

  let json: { rows?: SearchAnalyticsRow[] };
  try {
    json = JSON.parse(text) as { rows?: SearchAnalyticsRow[] };
  } catch {
    throw new Error(`GSC searchAnalytics returned non-JSON response: ${text}`);
  }

  return { rows: json.rows ?? [] };
}
