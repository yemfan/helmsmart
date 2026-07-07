import "server-only";

import { supabaseServer } from "@/lib/supabaseServer";
import { matchCityStateToGeo } from "@/lib/research/warehouse/match";
import {
  getLatestMetrics,
  getMetricSeries,
  type LatestMetric,
} from "@/lib/research/warehouse/read";
import {
  METRIC_META,
  METRIC_ORDER,
  findMetric,
  formatValue,
  isNum,
  momChange,
  yoyChange,
} from "@/lib/research/warehouse/format";

/**
 * Server orchestrator for the "Send Market Report to a client" flow.
 *
 *   createMarketReportForAgent() — match a contact's city/state to the Data
 *                                  Center warehouse, freeze a headline snapshot,
 *                                  and persist it as an agent-owned row.
 *   getPublicMarketReport()      — service-role read by id for the shareable
 *                                  /market-report/[id] page (share-by-link).
 *
 * The warehouse (market_geographies + market_metrics) is the single source of
 * truth for the numbers; this module snapshots the headline metrics so the
 * shared link stays stable even as the warehouse updates.
 */

export type MarketReportStat = {
  metric: string;
  label: string;
  value: number | null;
  unit: string | null;
  formatted: string;
  /** Month-over-month percent change, when a series is available. */
  momPct?: number | null;
  /** Year-over-year percent change, when 13+ months are available. */
  yoyPct?: number | null;
};

export type MarketReportSnapshot = {
  geoName: string;
  geoLevel: "metro" | "state";
  /** YYYY-MM-DD period of the newest headline observation. */
  asOfPeriod: string | null;
  /** Canonical Data Center path for cross-linking. */
  dataHref: string;
  source: string;
  stats: MarketReportStat[];
};

export type PublicMarketReport = {
  id: string;
  agentId: string;
  contactId: string | null;
  geoLevel: string;
  geoCode: string;
  geoName: string | null;
  subjectCity: string | null;
  subjectState: string | null;
  snapshot: MarketReportSnapshot;
  createdAt: string;
};

/** Metrics we surface, in client-friendly display order. */
const HEADLINE_METRICS = [
  "zhvi",
  "median_sale_price",
  "median_dom",
  "inventory",
] as const;

/** Metrics we compute MoM/YoY deltas for (avoids extra series reads). */
const DELTA_METRICS = new Set<string>(["zhvi", "median_sale_price"]);

type ContactRow = {
  id: string;
  city: string | null;
  state: string | null;
};

async function buildSnapshot(
  geoLevel: "metro" | "state",
  geoCode: string,
  geoName: string,
  dataHref: string,
): Promise<MarketReportSnapshot | null> {
  const latest = await getLatestMetrics(geoLevel, geoCode);
  if (!latest.length) return null;

  // Newest period among the headline metrics = the report's "as of".
  let asOfPeriod: string | null = null;

  const stats: MarketReportStat[] = [];
  // Preserve the intended headline order, then any remaining known metrics.
  const ordered = [
    ...HEADLINE_METRICS.filter((m) => findMetric(latest, m)),
  ];

  for (const metric of ordered) {
    const row: LatestMetric | null = findMetric(latest, metric);
    if (!row) continue;
    const meta = METRIC_META[metric];
    const label = meta?.short ?? meta?.label ?? metric;
    const formatted = formatValue(row.value, row.unit, { compact: true });

    if (row.period && (!asOfPeriod || row.period > asOfPeriod)) {
      asOfPeriod = row.period;
    }

    const stat: MarketReportStat = {
      metric,
      label,
      value: isNum(row.value) ? row.value : null,
      unit: row.unit ?? null,
      formatted,
    };

    if (DELTA_METRICS.has(metric)) {
      const series = await getMetricSeries(geoLevel, geoCode, metric, 13);
      const mom = momChange(series);
      const yoy = yoyChange(series);
      stat.momPct = isNum(mom.pct) ? mom.pct : null;
      stat.yoyPct = isNum(yoy.pct) ? yoy.pct : null;
    }

    stats.push(stat);
  }

  if (!stats.length) return null;

  return {
    geoName,
    geoLevel,
    asOfPeriod,
    dataHref,
    source: "Zillow Research, Redfin, FRED",
    stats,
  };
}

export async function createMarketReportForAgent(
  agentId: string,
  contactId: string,
): Promise<{ id: string } | { error: string }> {
  const contactIdTrim = (contactId ?? "").trim();
  if (!contactIdTrim) return { error: "A contact is required." };

  // Load the contact scoped to this agent (service-role read + explicit scope,
  // same posture as the CMA/contacts read paths on RLS-on business tables).
  const { data: contactData, error: contactErr } = await supabaseServer
    .from("contacts")
    .select("id, city, state")
    .eq("id", contactIdTrim)
    .eq("agent_id", agentId as never)
    .maybeSingle();

  if (contactErr) {
    console.warn("[marketReport.create] contact load failed:", contactErr.message);
    return { error: "Could not load that contact." };
  }
  const contact = contactData as ContactRow | null;
  if (!contact) return { error: "Contact not found." };

  const city = (contact.city ?? "").trim();
  const state = (contact.state ?? "").trim();
  if (!city || !state) {
    return { error: "Contact has no city/state" };
  }

  const geo = await matchCityStateToGeo(city, state);
  if (!geo) {
    return { error: "No market data for that location" };
  }

  const snapshot = await buildSnapshot(geo.geoLevel, geo.geoCode, geo.geoName, geo.dataHref);
  if (!snapshot) {
    return { error: "No market data for that location" };
  }

  const { data, error } = await supabaseServer
    .from("market_reports")
    .insert({
      agent_id: agentId,
      contact_id: contact.id,
      geo_level: geo.geoLevel,
      geo_code: geo.geoCode,
      geo_name: geo.geoName,
      subject_city: city,
      subject_state: state,
      snapshot_json: snapshot,
    } as never)
    .select("id")
    .single();

  if (error || !data) {
    console.warn("[marketReport.create] insert failed:", error?.message);
    return { error: error?.message ?? "Failed to save the market report." };
  }

  return { id: (data as { id: string }).id };
}

/**
 * Public read by id (no agent scope) for the shareable /market-report/[id]
 * page. Share-by-link, same posture as getPublicCma — the snapshot is frozen
 * and safe to expose.
 */
export async function getPublicMarketReport(
  id: string,
): Promise<PublicMarketReport | null> {
  const { data, error } = await supabaseServer
    .from("market_reports")
    .select(
      "id, agent_id, contact_id, geo_level, geo_code, geo_name, subject_city, subject_state, snapshot_json, created_at",
    )
    .eq("id", id)
    .maybeSingle();

  if (error) {
    console.warn("[marketReport.getPublic] failed:", error.message);
    return null;
  }
  if (!data) return null;

  const r = data as {
    id: string;
    agent_id: string | number;
    contact_id: string | null;
    geo_level: string;
    geo_code: string;
    geo_name: string | null;
    subject_city: string | null;
    subject_state: string | null;
    snapshot_json: unknown;
    created_at: string;
  };

  if (!r.snapshot_json || typeof r.snapshot_json !== "object") return null;

  return {
    id: r.id,
    agentId: String(r.agent_id),
    contactId: r.contact_id,
    geoLevel: r.geo_level,
    geoCode: r.geo_code,
    geoName: r.geo_name,
    subjectCity: r.subject_city,
    subjectState: r.subject_state,
    snapshot: r.snapshot_json as MarketReportSnapshot,
    createdAt: r.created_at,
  };
}
