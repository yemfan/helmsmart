import { apiFetch } from "@leadsmart/api-client";
import { getCloseBossApiBaseUrl } from "./env";

type SummaryJson = { ok?: boolean; error?: string };

/**
 * Optional connectivity check against CloseBoss (cookie auth won’t apply until you add tokens).
 * Returns a short status string for the home screen.
 */
export async function pingCloseBossApi(): Promise<string> {
  const base = getCloseBossApiBaseUrl();
  if (!base) {
    return "Set EXPO_PUBLIC_LEADSMART_API_URL to enable API checks.";
  }

  const res = await apiFetch<SummaryJson>(`${base}/api/dashboard/summary`, {
    method: "GET",
    credentials: "omit",
  });

  if (res.ok) {
    return "API reachable (JSON response received).";
  }
  if (res.status === 401 || res.status === 403) {
    return "API reachable (auth required — expected without session).";
  }
  return `API status ${res.status}: ${res.error}`;
}
