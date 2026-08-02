import "server-only";

import {
  getLatestSnapshot,
  getPropertyByAddress,
  type PropertyRow,
  type PropertySnapshotRow,
} from "@/lib/propertyService";
import { scrapeConfigured } from "@/lib/listings/photoScrape";
import { extractListingFromUrl } from "@/lib/listings/adIntake";
import type { ListingAdFacts } from "@/lib/listings/types";

/**
 * Shared property-lookup helper for the "Paste an address or URL"
 * Quick Post trigger. Both the web wizard and the mobile screen
 * pass arbitrary agent input (raw address, MLS URL, Zillow link,
 * etc.) — this returns a normalized brief snippet + whichever
 * structured fields we could resolve from properties_warehouse.
 *
 * Strategy:
 *   1. Try to extract an address-shaped string from the input. URL
 *      hosts we know (Zillow / Redfin / Realtor / Compass) embed
 *      the address in the path; everything else is treated as raw
 *      text and trimmed/normalized.
 *   2. Lookup the warehouse via getPropertyByAddress. If we hit,
 *      hydrate beds/baths/sqft/year_built + latest snapshot's
 *      estimated value + listing status.
 *   3. Stitch a brief string from whatever fields we have. The
 *      brief is what the AI sees — concrete details (address +
 *      key specs + price) translate to a much better caption than
 *      "share my listing".
 *
 * If we don't find a warehouse hit, the brief still includes the
 * normalized address so the agent can manually flesh out details
 * (the AI is told never to invent facts beyond the brief).
 */

export type PropertyLookupResult = {
  /** Best-effort extracted address (may equal the raw input). */
  address: string;
  /** True when we hit a row in properties_warehouse. */
  found: boolean;
  /** Structured fields, populated when `found === true`. */
  city: string | null;
  state: string | null;
  zipCode: string | null;
  beds: number | null;
  baths: number | null;
  sqft: number | null;
  yearBuilt: number | null;
  estimatedValue: number | null;
  listingStatus: string | null;
  /** Pre-stitched description suitable for dropping straight into
   *  the wizard's brief textarea. Never empty. */
  brief: string;
};

/**
 * Extract an address-shaped string from agent input. Handles a
 * handful of common listing-source URLs; otherwise returns the
 * input trimmed.
 *
 * The URL patterns target the address-in-path conventions:
 *   - zillow.com/homedetails/<slug>-<zpid>_zpid/
 *   - redfin.com/CA/<City>/<address-slug>-<zip>/home/<id>
 *   - realtor.com/realestateandhomes-detail/<address-slug>
 *   - compass.com/listing/<address-slug>/<id>
 *
 * The slug uses dashes for spaces. We replace dashes with spaces
 * and strip trailing tokens that look like ids (digits / _zpid /
 * etc.). Imperfect but good enough — the warehouse lookup is also
 * a normalize-and-equality check, so even a slightly off address
 * either hits exactly or misses cleanly.
 */
export function extractAddress(input: string): string {
  const trimmed = input.trim();
  if (!trimmed) return "";
  // URL? Try the known hosts.
  if (/^https?:\/\//i.test(trimmed)) {
    try {
      const u = new URL(trimmed);
      const host = u.hostname.toLowerCase();
      const path = u.pathname;
      if (host.includes("zillow.com")) {
        // /homedetails/<slug>-<zpid>_zpid/
        const m = path.match(/\/homedetails\/([^/]+?)(?:-\d+_zpid)?\/?$/i);
        if (m?.[1]) return dashToSpace(m[1]);
      }
      if (host.includes("redfin.com")) {
        // /<STATE>/<City>/<slug>-<zip>/home/<id>
        const m = path.match(/\/home\/(\d+)/);
        if (m) {
          // Use the segment just before /home/<id>.
          const before = path.split("/home/")[0];
          const seg = before?.split("/").pop() ?? "";
          if (seg) return dashToSpace(seg.replace(/-\d{5}$/, " $&").trim());
        }
      }
      if (host.includes("realtor.com")) {
        // /realestateandhomes-detail/<slug>_M-<id>
        const m = path.match(/realestateandhomes-detail\/([^_]+)/i);
        if (m?.[1]) return dashToSpace(m[1]);
      }
      if (host.includes("compass.com")) {
        // /listing/<slug>/<id>
        const m = path.match(/\/listing\/([^/]+)/i);
        if (m?.[1]) return dashToSpace(m[1]);
      }
      // Unknown host — return the path's last segment as a best
      // guess, otherwise fall through.
      const lastSeg = path.split("/").filter(Boolean).pop();
      if (lastSeg && lastSeg.includes("-")) return dashToSpace(lastSeg);
      return trimmed; // give up; let lookup fail gracefully
    } catch {
      return trimmed;
    }
  }
  // Plain address — return as-is, normalization happens in
  // getPropertyByAddress (lowercase + collapse whitespace).
  return trimmed;
}

function dashToSpace(s: string): string {
  return s
    .replace(/-/g, " ")
    .replace(/\s+/g, " ")
    .replace(/\d+\s*zpid$/i, "")
    .trim();
}

export async function lookupProperty(
  input: string,
): Promise<PropertyLookupResult> {
  const address = extractAddress(input);
  if (!address) {
    return {
      address: "",
      found: false,
      city: null,
      state: null,
      zipCode: null,
      beds: null,
      baths: null,
      sqft: null,
      yearBuilt: null,
      estimatedValue: null,
      listingStatus: null,
      brief: "",
    };
  }

  // The warehouse stores rows keyed by lowercased + whitespace-
  // normalized address. getPropertyByAddress does the normalization
  // for us.
  let row: PropertyRow | null = null;
  try {
    row = await getPropertyByAddress(address);
  } catch (e) {
    console.warn(
      "[leads-gen/lookup-property] warehouse lookup failed",
      e instanceof Error ? e.message : e,
    );
  }

  // Warehouse miss + the input is a listing URL + scraping is configured →
  // render the page and read real facts off it, so the brief isn't just an
  // address. Best-effort: any failure falls through to the plain address brief.
  const isUrl = /^https?:\/\//i.test(input.trim());
  const canScrape = scrapeConfigured();
  console.log(`[lookup-property] warehouseHit=${row !== null} isUrl=${isUrl} scrapeConfigured=${canScrape}`);
  if (!row && isUrl && canScrape) {
    try {
      const facts = await extractListingFromUrl(input.trim());
      console.log(
        `[lookup-property] scrape facts: beds=${facts.beds} baths=${facts.baths} sqft=${facts.sqft} price=${facts.price} photos=${facts.photoUrls.length} conf=${facts.confidence} warnings=${JSON.stringify(facts.warnings)}`,
      );
      if (facts && hasUsableFacts(facts)) {
        return resultFromFacts(address, input, facts);
      }
    } catch (e) {
      console.warn(
        "[leads-gen/lookup-property] scrape fallback failed",
        e instanceof Error ? e.message : e,
      );
    }
  }

  let snapshot: PropertySnapshotRow | null = null;
  if (row) {
    try {
      snapshot = await getLatestSnapshot(row.id);
    } catch {
      // Best-effort — snapshot is optional flavor.
    }
  }

  const brief = stitchBrief({
    address,
    row,
    snapshot,
    rawInput: input,
  });

  return {
    address,
    found: row !== null,
    city: row?.city ?? null,
    state: row?.state ?? null,
    zipCode: row?.zip_code ?? null,
    beds: row?.beds ?? null,
    baths: row?.baths ?? null,
    sqft: row?.sqft ?? null,
    yearBuilt: row?.year_built ?? null,
    estimatedValue: snapshot?.estimated_value ?? null,
    listingStatus: snapshot?.listing_status ?? null,
    brief,
  };
}

/**
 * Build the brief string the wizard pre-fills. Includes only the
 * fields we actually have so the AI never sees `null` placeholders
 * (which it would naively echo as "0 beds, 0 baths").
 */
function stitchBrief(params: {
  address: string;
  row: PropertyRow | null;
  snapshot: PropertySnapshotRow | null;
  rawInput: string;
}): string {
  const { address, row, snapshot, rawInput } = params;
  const lines: string[] = [];

  // Address line — most specific format we have.
  const cityState = [row?.city, row?.state].filter(Boolean).join(", ");
  if (cityState) {
    lines.push(`Property: ${capitalizeAddress(address)}, ${cityState}`);
  } else {
    lines.push(`Property: ${capitalizeAddress(address)}`);
  }

  // Specs line — beds/baths/sqft if known.
  const specs: string[] = [];
  if (row?.beds != null) specs.push(`${row.beds}bd`);
  if (row?.baths != null) specs.push(`${row.baths}ba`);
  if (row?.sqft != null) specs.push(`${row.sqft.toLocaleString()} sqft`);
  if (row?.year_built != null) specs.push(`built ${row.year_built}`);
  if (specs.length > 0) lines.push(`Specs: ${specs.join(", ")}`);

  // Value/price line.
  if (snapshot?.estimated_value != null) {
    lines.push(
      `Estimated value: $${Number(snapshot.estimated_value).toLocaleString()}`,
    );
  }
  if (snapshot?.listing_status) {
    lines.push(`Status: ${snapshot.listing_status}`);
  }

  // If we didn't find anything, hint to the agent.
  if (!row) {
    lines.push(
      "(Not in our property database yet — fill in any details you want the post to mention.)",
    );
  }

  // Preserve the original URL when one was supplied — the AI can
  // optionally include it in a CTA, and it's also handy for the
  // agent's reference if they re-open the wizard.
  if (/^https?:\/\//i.test(rawInput.trim()) && rawInput.trim() !== address) {
    lines.push(`Source: ${rawInput.trim()}`);
  }

  return lines.join("\n");
}

/** True when a scrape returned enough to beat the plain-address brief. */
function hasUsableFacts(f: ListingAdFacts): boolean {
  return (
    f.beds != null ||
    f.baths != null ||
    f.sqft != null ||
    f.price != null ||
    (f.description != null && f.description.length > 0) ||
    f.highlights.length > 0
  );
}

/** Map scraped listing facts → the lookup result the wizard expects. */
function resultFromFacts(
  fallbackAddress: string,
  rawInput: string,
  f: ListingAdFacts,
): PropertyLookupResult {
  const address = f.address ?? fallbackAddress;
  return {
    address,
    // `found: true` so the wizard shows the enriched brief without the
    // "not in our database" hint — we DID resolve real details, just from
    // the page rather than the warehouse.
    found: true,
    city: f.city,
    state: f.state,
    zipCode: null,
    beds: f.beds,
    baths: f.baths,
    sqft: f.sqft,
    yearBuilt: f.yearBuilt,
    estimatedValue: f.price,
    listingStatus: null,
    brief: stitchBriefFromFacts(address, rawInput, f),
  };
}

/** Build the brief from scraped facts. Mirrors stitchBrief's shape. */
function stitchBriefFromFacts(address: string, rawInput: string, f: ListingAdFacts): string {
  const lines: string[] = [];
  const cityState = [f.city, f.state].filter(Boolean).join(", ");
  lines.push(cityState ? `Property: ${capitalizeAddress(address)}, ${cityState}` : `Property: ${capitalizeAddress(address)}`);

  const specs: string[] = [];
  if (f.beds != null) specs.push(`${f.beds}bd`);
  if (f.baths != null) specs.push(`${f.baths}ba`);
  if (f.sqft != null) specs.push(`${f.sqft.toLocaleString()} sqft`);
  if (f.yearBuilt != null) specs.push(`built ${f.yearBuilt}`);
  if (specs.length > 0) lines.push(`Specs: ${specs.join(", ")}`);

  if (f.price != null) lines.push(`List price: $${Number(f.price).toLocaleString()}`);
  if (f.description) lines.push(`Description: ${f.description.slice(0, 600)}`);
  if (f.highlights.length > 0) lines.push(`Highlights: ${f.highlights.slice(0, 6).join(", ")}`);

  if (/^https?:\/\//i.test(rawInput.trim())) lines.push(`Source: ${rawInput.trim()}`);
  return lines.join("\n");
}

function capitalizeAddress(s: string): string {
  // Title-case helper — preserves the few all-caps tokens (NW / SE /
  // PO / etc.) intact while lowercasing everything else.
  return s
    .split(/\s+/)
    .map((w) => {
      if (/^[NSEW]{1,2}$/.test(w)) return w.toUpperCase();
      if (/^\d/.test(w)) return w;
      return w.charAt(0).toUpperCase() + w.slice(1).toLowerCase();
    })
    .join(" ");
}
