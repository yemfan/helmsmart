import "server-only";

import { PINTEREST_API_BASE } from "@/lib/pinterest/graph";
import type { PostInsights } from "./meta-post";

/**
 * Pin analytics — the read half of the Pinterest integration.
 *
 * `GET /v5/pins/{pin_id}/analytics` needs `pins:read`, which the connect flow
 * already requests, so this adds no new permission. It does need an explicit
 * date range: Pinterest returns nothing without one and caps the window at 90
 * days.
 *
 * Nothing will come back until Pins actually publish, which is gated on
 * Pinterest granting the app Standard access — see [[project_pinterest_autopost]].
 * Correct-but-empty is the expected state until then.
 */

/** Pinterest's metric names for the numbers we keep. */
const METRIC_TYPES = ["IMPRESSION", "SAVE", "PIN_CLICK", "OUTBOUND_CLICK"] as const;

/** Pinterest caps the analytics window; 90 days comfortably outlives our 14-day refresh window. */
const MAX_WINDOW_DAYS = 90;

function ymd(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function toNumber(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return Math.round(v);
  if (typeof v === "string" && v.trim() !== "") {
    const n = Number(v);
    if (Number.isFinite(n)) return Math.round(n);
  }
  return null;
}

/**
 * Pull the summary numbers out of whatever envelope Pinterest wrapped them in.
 *
 * The v5 response nests metrics under a key that varies with how the Pin is
 * owned ("all", or an ad-account id), and each bucket carries
 * `summary_metrics` alongside `daily_metrics`. Rather than hard-code one path
 * and get null numbers if it differs, walk the object for the first
 * `summary_metrics` object we find. A wrong guess about the envelope would
 * look exactly like a Pin with no engagement, which is the kind of silence
 * this codebase has been bitten by repeatedly.
 */
export function extractSummaryMetrics(body: unknown): Record<string, unknown> | null {
  if (!body || typeof body !== "object") return null;
  const seen = new Set<unknown>();
  const stack: unknown[] = [body];
  while (stack.length) {
    const node = stack.shift();
    if (!node || typeof node !== "object" || seen.has(node)) continue;
    seen.add(node);
    const rec = node as Record<string, unknown>;
    const summary = rec.summary_metrics ?? rec.lifetime_metrics;
    if (summary && typeof summary === "object" && !Array.isArray(summary)) {
      return summary as Record<string, unknown>;
    }
    for (const v of Object.values(rec)) {
      if (v && typeof v === "object") stack.push(v);
    }
  }
  return null;
}

/**
 * Map Pinterest's vocabulary onto the shared PostInsights shape.
 *
 * Pinterest has no equivalent of likes, comments, shares, or reach at Pin
 * level, so those stay null rather than being faked with a zero — a real 0 and
 * "this platform doesn't report it" are different facts, and the engagement
 * score already treats null as 0 without claiming the number exists.
 *
 * `clicks` takes PIN_CLICK (someone opened the Pin), which is the closest
 * analogue to the click Meta reports. OUTBOUND_CLICK — the click through to
 * the agent's listing — has no column yet; it is the obvious one to add when
 * there is somewhere to show it.
 */
export function mapPinterestMetrics(summary: Record<string, unknown> | null): PostInsights | null {
  if (!summary) return null;
  const impressions = toNumber(summary.IMPRESSION);
  const saves = toNumber(summary.SAVE);
  const clicks = toNumber(summary.PIN_CLICK);
  if (impressions === null && saves === null && clicks === null) return null;
  return {
    likes: null,
    comments: null,
    shares: null,
    saves,
    impressions,
    reach: null,
    clicks,
    reactionsTotal: null,
  };
}

/** Fetch analytics for one Pin. Returns null when Pinterest reports nothing usable. */
export async function fetchPinterestPinInsights(params: {
  accessToken: string;
  pinId: string;
  /** Defaults to the last 90 days, the widest window Pinterest allows. */
  since?: Date;
  until?: Date;
}): Promise<PostInsights | null> {
  const until = params.until ?? new Date();
  const since =
    params.since ?? new Date(until.getTime() - MAX_WINDOW_DAYS * 24 * 60 * 60 * 1000);

  const qs = new URLSearchParams({
    start_date: ymd(since),
    end_date: ymd(until),
    metric_types: METRIC_TYPES.join(","),
  });

  const res = await fetch(
    `${PINTEREST_API_BASE}/pins/${encodeURIComponent(params.pinId)}/analytics?${qs.toString()}`,
    { headers: { authorization: `Bearer ${params.accessToken}` } },
  );
  const json = (await res.json().catch(() => null)) as unknown;
  if (!res.ok) {
    const message =
      (json && typeof json === "object" && (json as { message?: string }).message) ||
      `HTTP ${res.status}`;
    throw new Error(`Pinterest analytics failed: ${message}`);
  }
  return mapPinterestMetrics(extractSummaryMetrics(json));
}
