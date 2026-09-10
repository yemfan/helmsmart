/**
 * Open houses on the hub.
 *
 * An agent's upcoming open houses appear on their marketing hub without any
 * extra step: scheduling one on the Open Houses page is the act of
 * publishing it. Each card links to the open house's own sign-in page
 * (`/oh/<slug>`), which already carries the property facts and the visitor
 * form.
 *
 * Pure: the reading lives in loadHub.ts, the rendering in sections.tsx.
 * This file decides what counts as upcoming and how a date reads, and is
 * tested without a database.
 */

export type HubOpenHouse = {
  id: string;
  address: string;
  city: string | null;
  state: string | null;
  listPrice: number | null;
  /** ISO timestamps. */
  startAt: string;
  endAt: string;
  /** The public sign-in page slug. */
  slug: string;
};

export type OpenHouseSource = {
  id: unknown;
  property_address: unknown;
  city: unknown;
  state: unknown;
  list_price: unknown;
  start_at: unknown;
  end_at: unknown;
  signin_slug: unknown;
  status: unknown;
};

/** Statuses a visitor may act on. Completed and cancelled never show. */
export const HUB_OPEN_HOUSE_STATUSES = ["scheduled", "in_progress"] as const;

/** The default when the agent never set a time zone. Their briefings use the same one. */
export const DEFAULT_OPEN_HOUSE_TIME_ZONE = "America/Los_Angeles";

/**
 * Upcoming open houses, soonest first. An open house is upcoming until it
 * ENDS, so one in progress right now still shows ("open until 4 pm").
 */
export function upcomingOpenHouses(rows: OpenHouseSource[], nowIso: string, limit = 12): HubOpenHouse[] {
  const now = Date.parse(nowIso);
  const out: HubOpenHouse[] = [];
  for (const r of rows) {
    if (!HUB_OPEN_HOUSE_STATUSES.includes(String(r.status) as (typeof HUB_OPEN_HOUSE_STATUSES)[number])) continue;
    const startAt = String(r.start_at ?? "");
    const endAt = String(r.end_at ?? "");
    const end = Date.parse(endAt);
    if (!Number.isFinite(end) || end < now) continue;
    const slug = String(r.signin_slug ?? "").trim();
    const address = String(r.property_address ?? "").trim();
    if (!slug || !address) continue;
    const price = Number(r.list_price);
    out.push({
      id: String(r.id),
      address,
      city: String(r.city ?? "").trim() || null,
      state: String(r.state ?? "").trim() || null,
      // Zero is "not entered", never a price.
      listPrice: Number.isFinite(price) && price > 0 ? price : null,
      startAt,
      endAt,
      slug,
    });
  }
  out.sort((a, b) => Date.parse(a.startAt) - Date.parse(b.startAt));
  return out.slice(0, limit);
}

/**
 * "Sat, Sep 13, 1:00 – 3:00 PM" in the VISITOR's locale and the AGENT's time
 * zone — the open house happens where the house is, whoever is reading.
 * Falls back to a plain range when the runtime lacks formatRange.
 */
export function formatOpenHouseWhen(
  startIso: string,
  endIso: string,
  locale: string,
  timeZone: string | null | undefined,
): { date: string; time: string } {
  const tz = timeZone?.trim() || DEFAULT_OPEN_HOUSE_TIME_ZONE;
  const start = new Date(startIso);
  const end = new Date(endIso);
  const safe = (fmt: () => string, fallback: string) => {
    try {
      return fmt();
    } catch {
      return fallback;
    }
  };
  const date = safe(
    () => new Intl.DateTimeFormat(locale, { timeZone: tz, weekday: "short", month: "short", day: "numeric" }).format(start),
    startIso.slice(0, 10),
  );
  const time = safe(() => {
    const f = new Intl.DateTimeFormat(locale, { timeZone: tz, hour: "numeric", minute: "2-digit" });
    const range = (f as Intl.DateTimeFormat & { formatRange?: (a: Date, b: Date) => string }).formatRange;
    return range ? range.call(f, start, end) : `${f.format(start)} – ${f.format(end)}`;
  }, "");
  return { date, time };
}

/** "$1,180,000" in the visitor's locale; null when there is no price. */
export function formatListPrice(price: number | null, locale: string): string | null {
  if (!price || price <= 0) return null;
  try {
    return new Intl.NumberFormat(locale, { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(price);
  } catch {
    return `$${Math.round(price).toLocaleString(locale)}`;
  }
}

/** "Alhambra, CA" — the line under the street address; null when neither is known. */
export function openHouseLocality(oh: Pick<HubOpenHouse, "city" | "state">): string | null {
  return [oh.city, oh.state].filter(Boolean).join(", ") || null;
}
