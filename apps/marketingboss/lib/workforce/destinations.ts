import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { loadBrandKit } from "./tools/impl/_shared";

/**
 * Destinations — where the owner wants traffic to land.
 *
 * MarketingBoss does not build landing pages or offers; that is the account
 * owner's job and their decision. What we need from them is WHERE, and enough
 * about each place that a strategist can write a CTA that isn't generic:
 * "book a consult", "shop the sale" and "join the list" are different missions
 * pointing at different URLs.
 *
 * Falls back to the single `company_url` the app has always had, so an account
 * that never opens the new settings still behaves exactly as before.
 */

export type Destination = {
  /** Short label the owner recognises: "Booking page". */
  label: string;
  url: string;
  /** What someone gets there: "free 20-minute consult". Optional. */
  offer?: string | null;
  /** When to use it: "lead generation", "product launches". Optional. */
  useFor?: string | null;
};

export type UtmConfig = {
  enabled: boolean;
  source: string | null;
  medium: string | null;
  /** Template for utm_campaign; {mission} is substituted. */
  campaignTemplate: string | null;
  /** Route clicks through our own /r/ redirect so they can be counted. */
  redirect: boolean;
};

export const DEFAULT_UTM: UtmConfig = {
  enabled: false,
  source: "marketingboss",
  medium: "social",
  campaignTemplate: "{mission}",
  redirect: false,
};

function parseDestinations(v: unknown): Destination[] {
  if (!Array.isArray(v)) return [];
  return v
    .map((d): Destination | null => {
      const o = (d ?? {}) as Record<string, unknown>;
      const url = typeof o.url === "string" ? o.url.trim() : "";
      if (!/^https?:\/\//i.test(url)) return null;
      return {
        label: (typeof o.label === "string" && o.label.trim()) || url,
        url,
        offer: typeof o.offer === "string" ? o.offer.trim() || null : null,
        useFor: typeof o.use_for === "string" ? o.use_for.trim() || null : typeof o.useFor === "string" ? o.useFor.trim() || null : null,
      };
    })
    .filter((d): d is Destination => d !== null)
    .slice(0, 10);
}

/** The owner's configured destinations, or the legacy single company URL. */
export async function listDestinations(userId: string): Promise<Destination[]> {
  const admin = createAdminClient();
  const { data, error } = await admin.from("brand_kits").select("destinations, company_url").eq("user_id", userId).maybeSingle();

  // Pre-0028 database: the column does not exist. Fall back rather than fail.
  if (error || !data) {
    const kit = await loadBrandKit(userId).catch(() => null);
    const url = kit?.company_url?.trim();
    return url ? [{ label: "Website", url, offer: null, useFor: null }] : [];
  }

  const row = data as { destinations?: unknown; company_url?: string | null };
  const configured = parseDestinations(row.destinations);
  if (configured.length > 0) return configured;
  const url = row.company_url?.trim();
  return url ? [{ label: "Website", url, offer: null, useFor: null }] : [];
}

export async function loadUtm(userId: string): Promise<UtmConfig> {
  const admin = createAdminClient();
  const { data, error } = await admin.from("brand_kits").select("utm").eq("user_id", userId).maybeSingle();
  if (error || !data) return DEFAULT_UTM;
  const raw = (data as { utm?: unknown }).utm;
  if (!raw || typeof raw !== "object") return DEFAULT_UTM;
  const o = raw as Record<string, unknown>;
  return {
    enabled: o.enabled === true,
    source: typeof o.source === "string" ? o.source : DEFAULT_UTM.source,
    medium: typeof o.medium === "string" ? o.medium : DEFAULT_UTM.medium,
    campaignTemplate: typeof o.campaign_template === "string" ? o.campaign_template : DEFAULT_UTM.campaignTemplate,
    redirect: o.redirect === true,
  };
}

/** The destination block for Nina's system prompt. */
export function describeDestinations(destinations: Destination[]): string {
  if (destinations.length === 0) {
    return (
      "The owner has NOT configured a destination yet. If this mission is about leads, customers, or sales, ask " +
      "them where people should land before planning anything — do not default to guessing a homepage."
    );
  }
  return [
    "The owner configured these destinations. Pick the one that fits the mission and pass it as `link`:",
    ...destinations.map((d) => `- ${d.label}: ${d.url}${d.offer ? ` — ${d.offer}` : ""}${d.useFor ? ` (use for: ${d.useFor})` : ""}`),
  ].join("\n");
}

/**
 * True when a mission's objective is about outcomes we cannot observe. Used to
 * force the "where should this point?" question up front rather than letting a
 * whole campaign run at a homepage.
 */
export function isConversionShaped(objective: string): boolean {
  return /\b(lead|leads|customer|customers|client|clients|sale|sales|sell|selling|sign[- ]?up|signups?|book|booking|bookings|enquir|inquir|conversion)\w*\b/i.test(
    objective,
  );
}

/** Append UTM parameters to a destination. Never touches an already-tagged URL. */
export function withUtm(url: string, utm: UtmConfig, missionSlug: string): string {
  if (!utm.enabled) return url;
  try {
    const u = new URL(url);
    if (u.searchParams.has("utm_source")) return url;
    if (utm.source) u.searchParams.set("utm_source", utm.source);
    if (utm.medium) u.searchParams.set("utm_medium", utm.medium);
    const campaign = (utm.campaignTemplate ?? "{mission}").replace("{mission}", missionSlug);
    if (campaign) u.searchParams.set("utm_campaign", campaign);
    return u.toString();
  } catch {
    return url;
  }
}
