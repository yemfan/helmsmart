/**
 * The brokerage scorecard — the pure half.
 *
 * The office's production the way a broker reads it: closings, volume and
 * gross commission by month for the last twelve, the trailing year against
 * the year before, the market measures agents are judged on (days on
 * market, sale-to-list), and the pipeline that becomes next quarter's
 * closings. Rows in, a scorecard out; the reading lives in
 * scorecard.server.ts.
 */

export type TxRow = {
  id: string;
  agentId: string;
  /** closed | pending | active | terminated … as stored; mapped by `phaseOf`. */
  status: string;
  /** buyer_rep | listing_rep, when known. */
  type: string | null;
  price: number | null;
  /** Gross commission on the deal. */
  gci: number | null;
  acceptedOn: string | null;
  closedOn: string | null;
  expectedCloseOn: string | null;
  listedOn: string | null;
  listPrice: number | null;
  terminatedReason: string | null;
  address: string | null;
  /** Contingency deadlines and when they were cleared; null when not tracked. */
  inspectionDue: string | null;
  inspectionDone: string | null;
  appraisalDue: string | null;
  appraisalDone: string | null;
  loanDue: string | null;
  loanDone: string | null;
};

export type Health = "on_track" | "due_soon" | "at_risk";
export type HealthIssue = "inspection" | "appraisal" | "loan" | "closing";

export type HealthItem = {
  id: string;
  agentId: string;
  address: string | null;
  price: number | null;
  health: Health;
  /** The step that is late or due, worst first; null when on track. */
  issue: HealthIssue | null;
  dueOn: string | null;
  /** Positive when past due. */
  daysLate: number | null;
};

/** Within this many days a deadline is "due soon". */
export const DUE_SOON_DAYS = 7;

/**
 * Where an open deal stands: a contingency past its deadline and not cleared,
 * or a closing date gone by, is at risk; a deadline inside the week is due
 * soon; the rest are on track. The worst step wins the label.
 */
export function healthOf(row: TxRow, now: Date): HealthItem {
  const today = Math.floor(now.getTime() / 86_400_000);
  const steps: { issue: HealthIssue; due: string | null; done: string | null }[] = [
    { issue: "inspection", due: row.inspectionDue, done: row.inspectionDone },
    { issue: "appraisal", due: row.appraisalDue, done: row.appraisalDone },
    { issue: "loan", due: row.loanDue, done: row.loanDone },
    { issue: "closing", due: row.expectedCloseOn, done: null },
  ];
  let worst: { health: Health; issue: HealthIssue; dueOn: string; daysLate: number } | null = null;
  for (const s of steps) {
    if (!s.due || s.done) continue;
    const t = Date.parse(s.due);
    if (!Number.isFinite(t)) continue;
    const dueDay = Math.floor(t / 86_400_000);
    const late = today - dueDay;
    const health: Health = late > 0 ? "at_risk" : late >= -DUE_SOON_DAYS ? "due_soon" : "on_track";
    if (health === "on_track") continue;
    if (!worst || rank(health) > rank(worst.health) || (health === worst.health && late > worst.daysLate)) worst = { health, issue: s.issue, dueOn: s.due, daysLate: late };
  }
  return { id: row.id, agentId: row.agentId, address: row.address, price: row.price, health: worst?.health ?? "on_track", issue: worst?.issue ?? null, dueOn: worst?.dueOn ?? null, daysLate: worst ? worst.daysLate : null };
}

function rank(h: Health): number {
  return h === "at_risk" ? 2 : h === "due_soon" ? 1 : 0;
}

export type PipelineHealth = {
  onTrack: number;
  dueSoon: number;
  atRisk: number;
  atRiskVolume: number;
  /** At-risk and due-soon deals, worst first, capped. */
  items: HealthItem[];
};

export const HEALTH_ITEMS_MAX = 25;

export function pipelineHealth(open: readonly TxRow[], now: Date): PipelineHealth {
  const items = open.map((r) => healthOf(r, now));
  const flagged = items.filter((i) => i.health !== "on_track").sort((a, b) => rank(b.health) - rank(a.health) || (b.daysLate ?? 0) - (a.daysLate ?? 0));
  return {
    onTrack: items.filter((i) => i.health === "on_track").length,
    dueSoon: items.filter((i) => i.health === "due_soon").length,
    atRisk: items.filter((i) => i.health === "at_risk").length,
    atRiskVolume: items.filter((i) => i.health === "at_risk").reduce((a, i) => a + (i.price && i.price > 0 ? i.price : 0), 0),
    items: flagged.slice(0, HEALTH_ITEMS_MAX),
  };
}

export type ListingRow = { id: string; agentId: string; status: string; listPrice: number | null; startedOn: string | null };

export type MonthPoint = {
  /** "2026-09" */
  month: string;
  closed: number;
  volume: number;
  gci: number;
  /** Contracts written (mutual acceptance) in the month. */
  contracts: number;
  /** Listings taken in the month. */
  listingsTaken: number;
};

export type Period = {
  closed: number;
  volume: number;
  gci: number;
  avgPrice: number | null;
  medianPrice: number | null;
  avgGci: number | null;
  listingSide: number;
  buyerSide: number;
  terminated: number;
  /** terminated / (closed + terminated), null when nothing to divide. */
  fallThroughRate: number | null;
  producingAgents: number;
  closingsPerProducer: number | null;
};

export type Scorecard = {
  asOf: string;
  members: number;
  months: MonthPoint[];
  trailing: Period;
  prior: Period;
  market: {
    avgDom: number | null;
    medianDom: number | null;
    domSample: number;
    /** purchase / list, as a ratio (1.02 = 2% over asking). */
    saleToList: number | null;
    saleToListSample: number;
    activeListings: number;
    activeListVolume: number;
    pending: { count: number; volume: number };
    closingNext30: { count: number; volume: number };
    health: PipelineHealth;
  };
};

export type Phase = "closed" | "open" | "terminated" | "other";

export function phaseOf(row: Pick<TxRow, "status" | "closedOn" | "terminatedReason">): Phase {
  const s = row.status.toLowerCase();
  if (s === "closed") return row.closedOn ? "closed" : "other";
  if (/terminat|cancel|fell|withdrawn|expired/.test(s) || (row.terminatedReason && s !== "closed")) return "terminated";
  if (/pending|active|under_contract|contract|escrow|open/.test(s)) return "open";
  return "other";
}

export function monthKey(iso: string): string {
  return iso.slice(0, 7);
}

/** The twelve month keys ending with `now`'s month, oldest first. */
export function monthKeys(now: Date, count = 12): string[] {
  const out: string[] = [];
  for (let i = count - 1; i >= 0; i--) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
    out.push(`${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`);
  }
  return out;
}

export function median(values: readonly number[]): number | null {
  if (!values.length) return null;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

function daysBetween(a: string, b: string): number | null {
  const t1 = Date.parse(a);
  const t2 = Date.parse(b);
  if (!Number.isFinite(t1) || !Number.isFinite(t2)) return null;
  return Math.round((t2 - t1) / 86_400_000);
}

function period(rows: readonly TxRow[], keys: ReadonlySet<string>): Period {
  const closed = rows.filter((r) => phaseOf(r) === "closed" && keys.has(monthKey(r.closedOn!)));
  const terminated = rows.filter((r) => phaseOf(r) === "terminated" && keys.has(monthKey(r.acceptedOn ?? r.expectedCloseOn ?? ""))).length;
  const prices = closed.map((r) => r.price ?? 0).filter((p) => p > 0);
  const gcis = closed.map((r) => r.gci ?? 0).filter((g) => g > 0);
  const producers = new Set(closed.map((r) => r.agentId));
  const volume = prices.reduce((a, b) => a + b, 0);
  const gci = gcis.reduce((a, b) => a + b, 0);
  return {
    closed: closed.length,
    volume,
    gci,
    avgPrice: prices.length ? Math.round(volume / prices.length) : null,
    medianPrice: median(prices),
    avgGci: gcis.length ? Math.round(gci / gcis.length) : null,
    listingSide: closed.filter((r) => r.type === "listing_rep").length,
    buyerSide: closed.filter((r) => r.type === "buyer_rep").length,
    terminated,
    fallThroughRate: closed.length + terminated > 0 ? terminated / (closed.length + terminated) : null,
    producingAgents: producers.size,
    closingsPerProducer: producers.size ? closed.length / producers.size : null,
  };
}

export function buildScorecard(input: { now: Date; members: readonly string[]; transactions: readonly TxRow[]; listings: readonly ListingRow[] }): Scorecard {
  const { now, transactions, listings } = input;
  const keys = monthKeys(now, 24);
  const trailingKeys = keys.slice(12);
  const priorKeys = keys.slice(0, 12);
  const trailingSet = new Set(trailingKeys);

  const byMonth = new Map<string, MonthPoint>(trailingKeys.map((m) => [m, { month: m, closed: 0, volume: 0, gci: 0, contracts: 0, listingsTaken: 0 }]));
  for (const r of transactions) {
    const phase = phaseOf(r);
    if (phase === "closed") {
      const p = byMonth.get(monthKey(r.closedOn!));
      if (p) {
        p.closed += 1;
        p.volume += r.price && r.price > 0 ? r.price : 0;
        p.gci += r.gci && r.gci > 0 ? r.gci : 0;
      }
    }
    if (r.acceptedOn && phase !== "other") {
      const p = byMonth.get(monthKey(r.acceptedOn));
      if (p) p.contracts += 1;
    }
  }
  for (const l of listings) {
    if (!l.startedOn) continue;
    const p = byMonth.get(monthKey(l.startedOn));
    if (p) p.listingsTaken += 1;
  }

  // Days on market and sale-to-list: the office's own listings that closed in the trailing year.
  const doms: number[] = [];
  const ratios: number[] = [];
  for (const r of transactions) {
    if (phaseOf(r) !== "closed" || r.type !== "listing_rep" || !trailingSet.has(monthKey(r.closedOn!))) continue;
    if (r.listedOn && r.acceptedOn) {
      const d = daysBetween(r.listedOn, r.acceptedOn);
      if (d != null && d >= 0 && d < 1000) doms.push(d);
    }
    if (r.price && r.price > 0 && r.listPrice && r.listPrice > 0) ratios.push(r.price / r.listPrice);
  }

  const nowMs = now.getTime();
  const in30 = nowMs + 30 * 86_400_000;
  const open = transactions.filter((r) => phaseOf(r) === "open");
  const closingSoon = open.filter((r) => {
    const t = r.expectedCloseOn ? Date.parse(r.expectedCloseOn) : NaN;
    return Number.isFinite(t) && t >= nowMs - 86_400_000 && t <= in30;
  });
  const sum = (rows: readonly TxRow[]) => rows.reduce((a, r) => a + (r.price && r.price > 0 ? r.price : 0), 0);
  const activeListings = listings.filter((l) => /active|contracted|pending/i.test(l.status));

  return {
    asOf: now.toISOString(),
    members: input.members.length,
    months: trailingKeys.map((m) => byMonth.get(m)!),
    trailing: period(transactions, trailingSet),
    prior: period(transactions, new Set(priorKeys)),
    market: {
      avgDom: doms.length ? Math.round(doms.reduce((a, b) => a + b, 0) / doms.length) : null,
      medianDom: median(doms) == null ? null : Math.round(median(doms)!),
      domSample: doms.length,
      saleToList: ratios.length ? ratios.reduce((a, b) => a + b, 0) / ratios.length : null,
      saleToListSample: ratios.length,
      activeListings: activeListings.length,
      activeListVolume: activeListings.reduce((a, l) => a + (l.listPrice && l.listPrice > 0 ? l.listPrice : 0), 0),
      pending: { count: open.length, volume: sum(open) },
      closingNext30: { count: closingSoon.length, volume: sum(closingSoon) },
      health: pipelineHealth(open, now),
    },
  };
}
