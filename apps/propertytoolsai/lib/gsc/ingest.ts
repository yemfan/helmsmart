/**
 * Ingest Google Search Console metrics into gsc_page_metrics / gsc_query_metrics.
 *
 * GSC data lags ~2-3 days, so we pull a rolling window (today-5 .. today-1) and
 * upsert on the natural unique keys — re-running is idempotent and backfills the
 * lagged days as they finalize.
 */

import { supabaseServer } from "@/lib/supabaseServer";
import { listGscSites, searchAnalyticsQuery, type SearchAnalyticsRow } from "./client";

const ROW_LIMIT = 25000;
const UPSERT_BATCH = 500;

function ymd(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** Resolve target sites: GSC_SITE_URLS if set, else every property we can see. */
async function resolveSites(): Promise<string[]> {
  const raw = process.env.GSC_SITE_URLS ?? "";
  const parsed = raw
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

  if (parsed.length > 0) return parsed;

  const sites = await listGscSites();
  return sites.map((s) => s.siteUrl);
}

function toInt(n: number | undefined): number {
  return Number.isFinite(n) ? Math.round(n as number) : 0;
}

function toNum(n: number | undefined): number | null {
  return Number.isFinite(n) ? (n as number) : null;
}

async function upsertBatches<T extends Record<string, unknown>>(
  table: string,
  rows: T[],
  onConflict: string
): Promise<number> {
  let written = 0;
  for (let i = 0; i < rows.length; i += UPSERT_BATCH) {
    const chunk = rows.slice(i, i + UPSERT_BATCH);
    const { error } = await supabaseServer.from(table).upsert(chunk, { onConflict });
    if (error) {
      // Best-effort: log and keep going so one bad batch doesn't sink the run.
      console.warn(`[gsc] upsert into ${table} failed for a batch:`, error.message);
      continue;
    }
    written += chunk.length;
  }
  return written;
}

export async function ingestGscMetrics(): Promise<
  { site: string; pages: number; queries: number }[]
> {
  const sites = await resolveSites();
  if (sites.length === 0) {
    console.warn("[gsc] no sites resolved (GSC_SITE_URLS empty and listGscSites returned none)");
    return [];
  }

  const now = new Date();
  const start = new Date(now);
  start.setDate(start.getDate() - 5);
  const end = new Date(now);
  end.setDate(end.getDate() - 1);
  const startDate = ymd(start);
  const endDate = ymd(end);

  const results: { site: string; pages: number; queries: number }[] = [];

  for (const site of sites) {
    let pages = 0;
    let queries = 0;

    // --- date × page ---
    try {
      const { rows } = await searchAnalyticsQuery(site, {
        startDate,
        endDate,
        dimensions: ["date", "page"],
        rowLimit: ROW_LIMIT,
        dataState: "all",
      });
      const pageRows = rows
        .map((r: SearchAnalyticsRow) => {
          const keys = r.keys ?? [];
          const date = keys[0];
          const page = keys[1];
          if (!date || !page) return null;
          return {
            site,
            page,
            date,
            clicks: toInt(r.clicks),
            impressions: toInt(r.impressions),
            ctr: toNum(r.ctr),
            position: toNum(r.position),
          };
        })
        .filter((r): r is NonNullable<typeof r> => r !== null);

      pages = await upsertBatches("gsc_page_metrics", pageRows, "site,page,date");
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.warn(`[gsc] page query failed for ${site}:`, msg);
    }

    // --- date × query × page ---
    try {
      const { rows } = await searchAnalyticsQuery(site, {
        startDate,
        endDate,
        dimensions: ["date", "query", "page"],
        rowLimit: ROW_LIMIT,
        dataState: "all",
      });
      const queryRows = rows
        .map((r: SearchAnalyticsRow) => {
          const keys = r.keys ?? [];
          const date = keys[0];
          const query = keys[1];
          const page = keys[2];
          if (!date || !query || !page) return null;
          return {
            site,
            query,
            page,
            date,
            clicks: toInt(r.clicks),
            impressions: toInt(r.impressions),
            ctr: toNum(r.ctr),
            position: toNum(r.position),
          };
        })
        .filter((r): r is NonNullable<typeof r> => r !== null);

      queries = await upsertBatches("gsc_query_metrics", queryRows, "site,query,page,date");
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.warn(`[gsc] query query failed for ${site}:`, msg);
    }

    results.push({ site, pages, queries });
  }

  return results;
}
