/**
 * Aggregate signup attribution into a "where do signups come from?" readout.
 * Pure functions over the raw `agents` rows — no DB — so they're easy to reason
 * about and reuse. Attribution is captured going forward (AttributionCapture),
 * so accounts created before that carry no attribution and bucket as "Unknown".
 */

export type SignupAttribution = {
  utm_source?: string;
  utm_medium?: string;
  utm_campaign?: string;
  utm_term?: string;
  utm_content?: string;
  gclid?: string;
  fbclid?: string;
  referrer?: string;
  landing_path?: string;
  first_seen_at?: string;
};

export type SignupRow = {
  signup_attribution: SignupAttribution | null;
  created_at: string | null;
  plan_type: string | null;
  brand_name?: string | null;
};

export type SourceBucket = {
  source: string;
  signups: number;
  paid: number;
};

export type RecentSignup = {
  created_at: string | null;
  brand_name: string | null;
  source: string;
  medium: string;
  campaign: string;
  landing_path: string;
  plan_type: string;
};

export type SignupSourceSummary = {
  total: number;
  tracked: number;
  untracked: number;
  paid: number;
  bySource: SourceBucket[];
  recent: RecentSignup[];
};

function str(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

function host(url: string): string {
  try {
    return new URL(url).host.replace(/^www\./, "");
  } catch {
    return url.slice(0, 60);
  }
}

function isPaid(planType: string | null): boolean {
  const p = (planType ?? "").toLowerCase();
  return p !== "" && p !== "free";
}

/** Collapse an attribution blob into a single human source label + detail. */
export function deriveSource(attr: SignupAttribution | null): {
  source: string;
  medium: string;
  campaign: string;
} {
  if (!attr) return { source: "Unknown (pre-tracking)", medium: "", campaign: "" };
  const utmSource = str(attr.utm_source);
  if (utmSource) {
    return {
      source: utmSource.toLowerCase(),
      medium: str(attr.utm_medium).toLowerCase(),
      campaign: str(attr.utm_campaign),
    };
  }
  if (str(attr.gclid)) return { source: "google", medium: "cpc", campaign: "" };
  if (str(attr.fbclid)) return { source: "facebook", medium: "paid-social", campaign: "" };
  const ref = str(attr.referrer);
  if (ref) return { source: host(ref), medium: "referral", campaign: "" };
  // Attribution captured, but no marketing signal — a direct visit.
  return { source: "Direct", medium: "", campaign: "" };
}

export function summarizeSignupSources(rows: SignupRow[]): SignupSourceSummary {
  const buckets = new Map<string, SourceBucket>();
  let tracked = 0;
  let paid = 0;

  for (const r of rows) {
    if (r.signup_attribution) tracked++;
    const paidRow = isPaid(r.plan_type);
    if (paidRow) paid++;

    const { source } = deriveSource(r.signup_attribution);
    const b = buckets.get(source) ?? { source, signups: 0, paid: 0 };
    b.signups += 1;
    if (paidRow) b.paid += 1;
    buckets.set(source, b);
  }

  const bySource = [...buckets.values()].sort((a, b) => b.signups - a.signups);

  // Most recent first, latest 25, with the parsed source detail.
  const recent: RecentSignup[] = [...rows]
    .sort((a, b) => String(b.created_at ?? "").localeCompare(String(a.created_at ?? "")))
    .slice(0, 25)
    .map((r) => {
      const d = deriveSource(r.signup_attribution);
      return {
        created_at: r.created_at,
        brand_name: r.brand_name ?? null,
        source: d.source,
        medium: d.medium,
        campaign: d.campaign,
        landing_path: str(r.signup_attribution?.landing_path),
        plan_type: r.plan_type ?? "free",
      };
    });

  return {
    total: rows.length,
    tracked,
    untracked: rows.length - tracked,
    paid,
    bySource,
    recent,
  };
}
