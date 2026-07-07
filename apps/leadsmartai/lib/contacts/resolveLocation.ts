import { STATE_NAME_TO_CODE } from "@/lib/research/warehouse/slug";

/**
 * Derive a usable (city, state) for a contact that may be missing one or both.
 *
 * Many contacts have no explicit city/state but DO carry an `address`
 * ("… , Alhambra, CA 91803, USA") or a `search_location` ("Pasadena, CA").
 * This fills the gaps deterministically so per-contact market features (Send
 * Market Report, etc.) work for far more contacts. Preference per field:
 * explicit → address (where they live) → search_location (market of interest).
 * Conservative: never returns a street as a city, never invents a state.
 */

export type ContactLocationInput = {
  city?: string | null;
  state?: string | null;
  address?: string | null;
  search_location?: string | null;
};

export type ResolvedContactLocation = {
  city: string | null;
  /** 2-letter USPS code, or null. */
  state: string | null;
  source: "explicit" | "address" | "search_location" | "mixed" | null;
};

const VALID_CODES = new Set(Object.values(STATE_NAME_TO_CODE));
const STREET_RE =
  /\b(ave|avenue|st|street|blvd|boulevard|rd|road|dr|drive|ln|lane|apt|unit|suite|ste|hwy|highway|ct|court|pl|place|way|pkwy|parkway|cir|circle|ter|terrace|#)\b/i;

/** Normalize a state code or full name to a 2-letter USPS code, else null. */
export function toStateCode(raw?: string | null): string | null {
  if (!raw) return null;
  const s = raw.trim();
  if (/^[A-Za-z]{2}$/.test(s)) {
    const up = s.toUpperCase();
    return VALID_CODES.has(up) ? up : null;
  }
  const titled = s.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
  return STATE_NAME_TO_CODE[titled] ?? null;
}

function cleanCity(raw?: string | null): string | null {
  if (!raw) return null;
  const c = raw.replace(/\s+/g, " ").trim();
  // Reject obvious street lines / numbers so we never write a street as a city.
  if (!c || /^\d/.test(c) || STREET_RE.test(c)) return null;
  if (c.length < 2 || c.length > 60) return null;
  return c.replace(/\b\w/g, (ch) => ch.toUpperCase());
}

/**
 * Parse a "…, City, ST[ ZIP][, USA]" or "City, State" string into (city, state).
 * Works for both full addresses and short search-location strings.
 */
export function parseCityState(text?: string | null): { city: string | null; state: string | null } {
  if (!text) return { city: null, state: null };
  const parts = text
    .split(",")
    .map((p) => p.trim())
    .filter((p) => p && !/^(usa|united states)$/i.test(p));

  // Scan from the end for the part that carries the state (possibly "ST 91803").
  for (let i = parts.length - 1; i >= 0; i--) {
    const noZip = parts[i].replace(/\s*\d{5}(?:-\d{4})?\s*$/, "").trim();
    const state = toStateCode(noZip) ?? toStateCode(noZip.split(/\s+/)[0]);
    if (state) {
      const city = cleanCity(parts[i - 1]);
      return { city, state };
    }
  }
  return { city: null, state: null };
}

export function resolveContactLocation(c: ContactLocationInput): ResolvedContactLocation {
  const explicitCity = cleanCity(c.city);
  const explicitState = toStateCode(c.state);
  if (explicitCity && explicitState) {
    return { city: explicitCity, state: explicitState, source: "explicit" };
  }

  const fromAddress = parseCityState(c.address);
  const fromSearch = parseCityState(c.search_location);

  const city = explicitCity ?? fromAddress.city ?? fromSearch.city ?? null;
  const state = explicitState ?? fromAddress.state ?? fromSearch.state ?? null;

  let source: ResolvedContactLocation["source"] = null;
  if (city || state) {
    if (explicitCity || explicitState) source = "mixed";
    else if (fromAddress.city || fromAddress.state) source = "address";
    else source = "search_location";
  }
  return { city, state, source };
}
