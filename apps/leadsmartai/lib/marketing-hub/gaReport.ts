/**
 * Google Analytics 4 for the marketing page — the pure half.
 *
 * The Data API answers `runReport` with headers + rows of strings. This
 * module turns three such answers into one report shape the page renders,
 * and decides which of the agent's properties is the hub's. No fetching
 * here (that is lib/leads-gen/google-analytics.ts), so the rules are tested
 * without a Google account.
 *
 * Numbers are what Google returned or null. A report with no rows is an
 * empty report, not a row of zeros: an agent whose tag was added yesterday
 * should read "nothing yet", not "nobody came".
 */

export type GaProperty = { id: string; name: string; measurementIds: string[] };

export type GaTotals = {
  sessions: number | null;
  users: number | null;
  pageViews: number | null;
  keyEvents: number | null;
};

export type GaReport = {
  /** Whole property: everything the agent's tag sees, not only the hub. */
  all: GaTotals;
  /** Pages under the hub's path, or null when the property had no such rows. */
  hub: GaTotals | null;
  /** Session default channel groups, busiest first. */
  channels: { channel: string; sessions: number; users: number | null; keyEvents: number | null }[];
  /** Hub events the tag received (the ones hubEvents.ts forwards), busiest first. */
  events: { name: string; count: number }[];
};

/** The subset of a Data API runReport response this module reads. */
export type RunReportResponse = {
  dimensionHeaders?: { name?: string }[];
  metricHeaders?: { name?: string }[];
  rows?: { dimensionValues?: { value?: string }[]; metricValues?: { value?: string }[] }[];
  totals?: { metricValues?: { value?: string }[] }[];
};

type ParsedRow = { dims: string[]; metrics: Record<string, number | null> };

function num(v: string | undefined): number | null {
  if (v == null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/** Rows as named metrics; the TOTAL aggregation row when the report asked for one. */
export function parseRunReport(json: RunReportResponse | null | undefined): { rows: ParsedRow[]; totals: Record<string, number | null> | null } {
  const names = (json?.metricHeaders ?? []).map((h) => String(h.name ?? ""));
  const toMetrics = (values: { value?: string }[] | undefined): Record<string, number | null> => {
    const out: Record<string, number | null> = {};
    names.forEach((name, i) => {
      out[name] = num(values?.[i]?.value);
    });
    return out;
  };
  const rows = (json?.rows ?? []).map((r) => ({
    dims: (r.dimensionValues ?? []).map((d) => String(d.value ?? "")),
    metrics: toMetrics(r.metricValues),
  }));
  const total = json?.totals?.[0];
  return { rows, totals: total ? toMetrics(total.metricValues) : null };
}

function totalsOf(m: Record<string, number | null> | null | undefined): GaTotals {
  return {
    sessions: m?.sessions ?? null,
    users: m?.totalUsers ?? null,
    pageViews: m?.screenPageViews ?? null,
    keyEvents: m?.keyEvents ?? null,
  };
}

/**
 * One report from the three answers: channels (with a TOTAL row for the
 * whole property), the hub-path subset, and hub event counts.
 */
export function buildGaReport(args: {
  channels: RunReportResponse | null | undefined;
  hub: RunReportResponse | null | undefined;
  events: RunReportResponse | null | undefined;
}): GaReport {
  const ch = parseRunReport(args.channels);
  const channels = ch.rows
    .filter((r) => r.dims[0] && (r.metrics.sessions ?? 0) > 0)
    .map((r) => ({
      channel: r.dims[0]!,
      sessions: r.metrics.sessions ?? 0,
      users: r.metrics.totalUsers ?? null,
      keyEvents: r.metrics.keyEvents ?? null,
    }))
    .sort((a, b) => b.sessions - a.sessions);
  // Without an aggregation row, the total is the sum of what came back.
  const all = ch.totals
    ? totalsOf(ch.totals)
    : channels.length
      ? {
          sessions: channels.reduce((s, c) => s + c.sessions, 0),
          users: channels.some((c) => c.users != null) ? channels.reduce((s, c) => s + (c.users ?? 0), 0) : null,
          pageViews: null,
          keyEvents: channels.some((c) => c.keyEvents != null) ? channels.reduce((s, c) => s + (c.keyEvents ?? 0), 0) : null,
        }
      : totalsOf(null);

  const hubRows = parseRunReport(args.hub);
  const hubRow = hubRows.totals ?? hubRows.rows[0]?.metrics ?? null;
  const hub = hubRow && Object.values(hubRow).some((v) => v != null) ? totalsOf(hubRow) : null;

  const events = parseRunReport(args.events)
    .rows.filter((r) => r.dims[0] && (r.metrics.eventCount ?? 0) > 0)
    .map((r) => ({ name: r.dims[0]!, count: r.metrics.eventCount ?? 0 }))
    .sort((a, b) => b.count - a.count);

  return { all, hub, channels, events };
}

/**
 * Which property is the hub's. The measurement id the agent typed into
 * Settings is the strongest signal: the property whose web stream carries
 * it. Failing that, an account with exactly one property has an obvious
 * answer. Anything else is the agent's call — return null and let them pick.
 */
export function matchGaProperty(properties: GaProperty[], measurementId: string | null | undefined): GaProperty | null {
  const wanted = (measurementId ?? "").trim().toUpperCase();
  if (wanted) {
    const hit = properties.find((p) => p.measurementIds.some((m) => m.trim().toUpperCase() === wanted));
    if (hit) return hit;
  }
  return properties.length === 1 ? properties[0]! : null;
}

/** "properties/123" or "123" → "123"; anything else → null. */
export function gaPropertyId(raw: unknown): string | null {
  const s = String(raw ?? "").trim().replace(/^properties\//, "");
  return /^\d{1,20}$/.test(s) ? s : null;
}

/** Cached reports live in one JSONB keyed by window; this reads one window. */
export function cachedGaReport(
  cache: unknown,
  days: number,
  now: number,
  maxAgeMs: number,
): { report: GaReport; refreshedAt: string; fresh: boolean } | null {
  if (!cache || typeof cache !== "object") return null;
  const entry = (cache as Record<string, unknown>)[String(days)];
  if (!entry || typeof entry !== "object") return null;
  const { report, refreshedAt } = entry as { report?: unknown; refreshedAt?: unknown };
  if (!report || typeof report !== "object" || typeof refreshedAt !== "string") return null;
  const at = Date.parse(refreshedAt);
  if (!Number.isFinite(at)) return null;
  return { report: report as GaReport, refreshedAt, fresh: now - at < maxAgeMs };
}
