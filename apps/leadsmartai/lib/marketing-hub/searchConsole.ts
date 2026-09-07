/**
 * Google Search for the marketing page — the pure half.
 *
 * The platform already imports Search Console daily for its own domains
 * (gsc_page_metrics / gsc_query_metrics, written by the propertytoolsai
 * cron). An agent's hub lives under that domain, so their search
 * impressions and clicks are in there under pages that start with
 * /@handle. Nothing to connect: this reads the rows for their prefix.
 *
 * Google reports a page URL as it indexed it, so the "@" may arrive raw or
 * percent-encoded; both spellings are the same hub.
 */

export type GscPageRow = { page?: unknown; date?: unknown; clicks?: unknown; impressions?: unknown; position?: unknown };
export type GscQueryRow = GscPageRow & { query?: unknown };

export type HubSearchSummary = {
  impressions: number;
  clicks: number;
  /** clicks / impressions, or null when nothing was shown. */
  ctr: number | null;
  /** Impression-weighted average position, or null. */
  position: number | null;
  /** Distinct hub pages Google showed. */
  pages: number;
  /** Latest day Google reported, for "as of". */
  lastDate: string | null;
  topPages: { path: string; impressions: number; clicks: number; position: number | null }[];
  topQueries: { query: string; impressions: number; clicks: number; position: number | null }[];
};

/** "sc-domain:closebossai.com" for https://www.closebossai.com; null for a host Search Console would not have. */
export function gscSiteFor(origin: string): string | null {
  try {
    const host = new URL(origin).hostname.toLowerCase().replace(/^www\./, "");
    if (!host.includes(".") || host === "localhost" || host.endsWith(".vercel.app")) return null;
    return `sc-domain:${host}`;
  } catch {
    return null;
  }
}

/** The URL prefixes a hub's pages can be reported under. */
export function hubPagePrefixes(origin: string, username: string): string[] {
  const base = origin.replace(/\/+$/, "");
  const u = username.trim();
  if (!u) return [];
  return [`${base}/@${u}`, `${base}/%40${u}`];
}

function isHubPage(page: string, prefixes: string[]): boolean {
  const p = page.toLowerCase();
  return prefixes.some((pre) => {
    const x = pre.toLowerCase();
    if (!p.startsWith(x)) return false;
    const rest = p.slice(x.length);
    return rest === "" || rest.startsWith("/") || rest.startsWith("?") || rest.startsWith("#");
  });
}

function num(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function pathOf(page: string, prefixes: string[]): string {
  for (const pre of prefixes) {
    if (page.toLowerCase().startsWith(pre.toLowerCase())) {
      const rest = page.slice(pre.length).replace(/\/+$/, "");
      return rest || "/";
    }
  }
  return page;
}

type Acc = { impressions: number; clicks: number; posWeight: number };
function add(acc: Acc, r: GscPageRow) {
  const impressions = num(r.impressions);
  acc.impressions += impressions;
  acc.clicks += num(r.clicks);
  const pos = r.position == null ? null : Number(r.position);
  if (pos != null && Number.isFinite(pos)) acc.posWeight += pos * impressions;
}
function finish(acc: Acc) {
  return {
    impressions: acc.impressions,
    clicks: acc.clicks,
    position: acc.impressions > 0 && acc.posWeight > 0 ? Math.round((acc.posWeight / acc.impressions) * 10) / 10 : null,
  };
}

/**
 * One summary for a hub from the daily rows. Null when Google has never
 * shown the hub: the page says so in words instead of a row of zeros.
 */
export function hubSearchSummary(args: { origin: string; username: string; pageRows: GscPageRow[]; queryRows: GscQueryRow[]; top?: number }): HubSearchSummary | null {
  const prefixes = hubPagePrefixes(args.origin, args.username);
  if (!prefixes.length) return null;
  const top = args.top ?? 5;

  const total: Acc = { impressions: 0, clicks: 0, posWeight: 0 };
  const byPage = new Map<string, Acc>();
  let lastDate: string | null = null;
  for (const r of args.pageRows) {
    const page = String(r.page ?? "");
    if (!page || !isHubPage(page, prefixes)) continue;
    add(total, r);
    const path = pathOf(page, prefixes);
    const acc = byPage.get(path) ?? { impressions: 0, clicks: 0, posWeight: 0 };
    add(acc, r);
    byPage.set(path, acc);
    const d = typeof r.date === "string" ? r.date : null;
    if (d && (!lastDate || d > lastDate)) lastDate = d;
  }
  if (byPage.size === 0) return null;

  const byQuery = new Map<string, Acc>();
  for (const r of args.queryRows) {
    const page = String(r.page ?? "");
    const q = String(r.query ?? "").trim();
    if (!q || !page || !isHubPage(page, prefixes)) continue;
    const acc = byQuery.get(q) ?? { impressions: 0, clicks: 0, posWeight: 0 };
    add(acc, r);
    byQuery.set(q, acc);
  }

  const rank = (a: Acc, b: Acc) => b.clicks - a.clicks || b.impressions - a.impressions;
  const t = finish(total);
  return {
    ...t,
    ctr: t.impressions > 0 ? Math.round((t.clicks / t.impressions) * 1000) / 1000 : null,
    pages: byPage.size,
    lastDate,
    topPages: [...byPage.entries()]
      .sort((a, b) => rank(a[1], b[1]))
      .slice(0, top)
      .map(([path, acc]) => ({ path, ...finish(acc) })),
    topQueries: [...byQuery.entries()]
      .sort((a, b) => rank(a[1], b[1]))
      .slice(0, top)
      .map(([query, acc]) => ({ query, ...finish(acc) })),
  };
}
