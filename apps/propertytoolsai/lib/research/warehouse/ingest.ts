import "server-only";

import { supabaseServer } from "@/lib/supabaseServer";
import type { ConnectorResult, GeoRow, MetricRow } from "./types";
import { ingestFred } from "./fred";
import { ingestZillow } from "./zillow";
import { ingestRedfin } from "./redfin";

/**
 * Ingestion orchestrator for the Data Center market warehouse (Phase B).
 *
 * Runs every connector (FRED, Zillow, Redfin), best-effort — one source failing
 * must NOT abort the others — then upserts market_geographies (dimension) before
 * market_metrics (facts), in batches to keep request payloads small enough for
 * the serverless function.
 */

const BATCH = 500;

export type SourceSummary = {
  source: string;
  rowsUpserted: number;
  geosUpserted: number;
  errors: string[];
};

export type IngestSummary = {
  startedAt: string;
  finishedAt: string;
  totalRows: number;
  totalGeos: number;
  sources: SourceSummary[];
};

/** Dedupe geographies by (geo_level, geo_code), preferring richer rows. */
function dedupeGeos(geos: GeoRow[]): GeoRow[] {
  const map = new Map<string, GeoRow>();
  for (const g of geos) {
    const key = `${g.geo_level}:${g.geo_code}`;
    const existing = map.get(key);
    if (!existing) {
      map.set(key, g);
      continue;
    }
    // Fill in missing size_rank / state from whichever row has it.
    map.set(key, {
      ...existing,
      size_rank: existing.size_rank ?? g.size_rank,
      state: existing.state ?? g.state,
      geo_name: existing.geo_name || g.geo_name,
    });
  }
  return Array.from(map.values());
}

/** Dedupe metrics by the unique key so a single batch never self-conflicts. */
function dedupeMetrics(metrics: MetricRow[]): MetricRow[] {
  const map = new Map<string, MetricRow>();
  for (const m of metrics) {
    map.set(`${m.geo_level}:${m.geo_code}:${m.metric}:${m.period}`, m);
  }
  return Array.from(map.values());
}

async function upsertGeos(geos: GeoRow[]): Promise<{ upserted: number; errors: string[] }> {
  const errors: string[] = [];
  let upserted = 0;
  const rows = geos.map((g) => ({ ...g, updated_at: new Date().toISOString() }));
  for (let i = 0; i < rows.length; i += BATCH) {
    const slice = rows.slice(i, i + BATCH);
    const { error } = await supabaseServer
      .from("market_geographies")
      .upsert(slice, { onConflict: "geo_level,geo_code" });
    if (error) errors.push(`geos[${i}]: ${error.message}`);
    else upserted += slice.length;
  }
  return { upserted, errors };
}

async function upsertMetrics(
  metrics: MetricRow[],
): Promise<{ upserted: number; errors: string[] }> {
  const errors: string[] = [];
  let upserted = 0;
  for (let i = 0; i < metrics.length; i += BATCH) {
    const slice = metrics.slice(i, i + BATCH);
    const { error } = await supabaseServer
      .from("market_metrics")
      .upsert(slice, { onConflict: "geo_level,geo_code,metric,period" });
    if (error) errors.push(`metrics[${i}]: ${error.message}`);
    else upserted += slice.length;
  }
  return { upserted, errors };
}

/**
 * Run all connectors and persist their output. Returns a per-source summary.
 */
export async function ingestMarketWarehouse(): Promise<IngestSummary> {
  const startedAt = new Date().toISOString();

  // Run connectors best-effort and in parallel.
  const results: ConnectorResult[] = await Promise.all([
    ingestFred().catch((e): ConnectorResult => ({
      source: "FRED / St. Louis Fed",
      metrics: [],
      geographies: [],
      error: e instanceof Error ? e.message : String(e),
    })),
    ingestZillow().catch((e): ConnectorResult => ({
      source: "Zillow Research",
      metrics: [],
      geographies: [],
      error: e instanceof Error ? e.message : String(e),
    })),
    ingestRedfin().catch((e): ConnectorResult => ({
      source: "Redfin Data Center",
      metrics: [],
      geographies: [],
      error: e instanceof Error ? e.message : String(e),
    })),
  ]);

  const sources: SourceSummary[] = [];
  let totalRows = 0;
  let totalGeos = 0;

  for (const result of results) {
    const errors: string[] = [];
    if (result.error) errors.push(result.error);

    const geos = dedupeGeos(result.geographies);
    const metrics = dedupeMetrics(result.metrics);

    const geoRes = geos.length
      ? await upsertGeos(geos)
      : { upserted: 0, errors: [] as string[] };
    errors.push(...geoRes.errors);

    const metricRes = metrics.length
      ? await upsertMetrics(metrics)
      : { upserted: 0, errors: [] as string[] };
    errors.push(...metricRes.errors);

    totalRows += metricRes.upserted;
    totalGeos += geoRes.upserted;

    sources.push({
      source: result.source,
      rowsUpserted: metricRes.upserted,
      geosUpserted: geoRes.upserted,
      errors,
    });
  }

  return {
    startedAt,
    finishedAt: new Date().toISOString(),
    totalRows,
    totalGeos,
    sources,
  };
}
