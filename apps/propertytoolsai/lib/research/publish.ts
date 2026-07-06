import "server-only";

import { generateResearchReport } from "./generateReport";
import { upsertResearchReport } from "./db";
import type { ResearchKind } from "./types";

/**
 * Generate + persist one research report. Best-effort: returns the slug on
 * success, or null on any failure (generation miss, DB error). The cron routes
 * call this and report ok/skip accordingly.
 *
 * Slug convention (dated, stable per day so a same-day re-run upserts):
 *   weekly_rates   -> mortgage-rate-report-YYYY-MM-DD
 *   monthly_market -> housing-market-report-YYYY-MM-DD
 */
export async function publishResearchReport(kind: ResearchKind): Promise<string | null> {
  const report = await generateResearchReport(kind);
  if (!report) return null;

  const publishedDate = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
  const prefix = kind === "weekly_rates" ? "mortgage-rate-report" : "housing-market-report";
  const slug = `${prefix}-${publishedDate}`;

  const res = await upsertResearchReport(report, slug, publishedDate);
  if (!res.ok) {
    console.warn("[research] publish upsert failed:", res.error);
    return null;
  }
  return slug;
}
