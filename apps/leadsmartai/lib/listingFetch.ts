import { detectPlatform, type ListingPlatform } from "@/lib/listingUrl";

export type ListingParsedData = {
  address: string | null;
  city?: string | null;
  state?: string | null;
  zip_code?: string | null;
  lat?: number | null;
  lng?: number | null;
  property_type?: string | null;
  beds?: number | null;
  baths?: number | null;
  sqft?: number | null;
  lot_size?: number | null;
  year_built?: number | null;
  price?: number | null;
  rent_estimate?: number | null;
  listing_status?: string | null;
  source_url: string;
  source_platform: ListingPlatform;
  raw?: unknown;
};

function safeJsonParse<T>(text: string): T | null {
  try {
    return JSON.parse(text) as T;
  } catch {
    return null;
  }
}

function extractNextData(html: string): any | null {
  const m = html.match(
    /<script[^>]+id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/i
  );
  if (!m) return null;
  return safeJsonParse<any>(m[1]);
}

function extractJsonLd(html: string): any[] {
  const out: any[] = [];
  const re = /<script[^>]+type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    const parsed = safeJsonParse<any>(m[1].trim());
    if (parsed) out.push(parsed);
  }
  return out;
}

function pick<T>(...vals: (T | null | undefined)[]): T | null {
  for (const v of vals) {
    if (v !== undefined && v !== null) return v;
  }
  return null;
}

function num(v: any): number | null {
  const n = typeof v === "string" ? Number(v.replace(/[^\d.-]/g, "")) : Number(v);
  return Number.isFinite(n) ? n : null;
}

function getString(v: any): string | null {
  if (typeof v === "string" && v.trim()) return v.trim();
  return null;
}

function toAddressLine(parts: {
  street?: string | null;
  city?: string | null;
  state?: string | null;
  zip?: string | null;
}) {
  const chunks = [parts.street, parts.city, parts.state, parts.zip].filter(Boolean);
  return chunks.join(", ");
}

/**
 * Map a schema.org `availability` URL onto a real-estate listing
 * status string. Zillow's RealEstateListing JSON-LD uses the
 * generic Schema.org Offer pattern, so we get values like
 * "https://schema.org/InStock" rather than MLS terminology.
 *
 * Mapping:
 *   InStock / OnlineOnly        → "Active"   (listed and available)
 *   PreOrder / BackOrder        → "Pending"  (closest to listed-but-not-bookable in real estate)
 *   LimitedAvailability         → "Active"   (still listed, just constrained)
 *   OutOfStock / SoldOut /      → "Sold"     (not for sale)
 *      Discontinued
 *   Anything else / missing     → null
 *
 * Returns null when input is empty so the merge in
 * /api/property/from-listing can continue to prefer Rentcast's
 * authoritative MLS status when both sources are present.
 */
function availabilityToStatus(availability: unknown): string | null {
  if (typeof availability !== "string") return null;
  // Schema.org URLs end in the enum value name. Strip the prefix.
  const tail = availability.split("/").pop()?.toLowerCase() ?? "";
  if (!tail) return null;
  if (tail === "instock" || tail === "onlineonly" || tail === "limitedavailability") {
    return "Active";
  }
  if (tail === "preorder" || tail === "backorder") return "Pending";
  if (tail === "outofstock" || tail === "soldout" || tail === "discontinued") {
    return "Sold";
  }
  return null;
}

function parseFromJsonLd(jsonlds: any[]): Partial<ListingParsedData> | null {
  for (const node of jsonlds) {
    const obj = Array.isArray(node) ? node[0] : node;
    if (!obj) continue;

    // Zillow often nests property details under offers.itemOffered for RealEstateListing
    const offered = obj.offers?.itemOffered ?? obj.itemOffered ?? null;

    const addrObj = obj.address ?? offered?.address;
    const street = getString(addrObj?.streetAddress);
    const city = getString(addrObj?.addressLocality);
    const state = getString(addrObj?.addressRegion);
    const zip = getString(addrObj?.postalCode);
    const address = street ? toAddressLine({ street, city, state, zip }) : null;
    // Pull listing status from the Offer's availability field. This
    // is the only authoritative listing-status signal in JSON-LD —
    // Zillow doesn't expose MLS status directly, but availability:
    // InStock/SoldOut maps cleanly to Active/Sold for real estate.
    const availability = obj.offers?.availability ?? offered?.offers?.availability ?? null;
    return {
      address,
      city,
      state,
      zip_code: zip,
      beds: num(
        obj.numberOfRooms ??
          offered?.numberOfBedrooms ??
          offered?.numberOfRooms ??
          offered?.bedrooms
      ),
      baths: num(
        obj.numberOfBathroomsTotal ??
          offered?.numberOfBathroomsTotal ??
          offered?.bathrooms ??
          offered?.baths
      ),
      sqft: num(
        obj.floorSize?.value ??
          obj.floorSize ??
          offered?.floorSize?.value ??
          offered?.floorSize ??
          offered?.livingArea
      ),
      lat: num(obj.geo?.latitude ?? offered?.geo?.latitude),
      lng: num(obj.geo?.longitude ?? offered?.geo?.longitude),
      property_type:
        getString(offered?.["@type"]) ??
        getString(obj["@type"]) ??
        getString(obj.category),
      price: num(obj.offers?.price ?? obj.price),
      listing_status: availabilityToStatus(availability),
    };
  }
  return null;
}

function deepFind(obj: any, predicate: (k: string, v: any) => boolean): any[] {
  const found: any[] = [];
  const seen = new Set<any>();
  const stack = [obj];
  while (stack.length) {
    const cur = stack.pop();
    if (!cur || typeof cur !== "object") continue;
    if (seen.has(cur)) continue;
    seen.add(cur);
    if (Array.isArray(cur)) {
      for (const it of cur) stack.push(it);
      continue;
    }
    for (const [k, v] of Object.entries(cur)) {
      if (predicate(k, v)) found.push(v);
      if (v && typeof v === "object") stack.push(v);
    }
  }
  return found;
}

/**
 * Map Zillow's `homeStatus` enum onto a real-estate status string.
 * This is the most reliable status signal Zillow exposes — far
 * better than schema.org `availability` which they sometimes omit.
 *
 * Values seen in the wild (from Zillow's __NEXT_DATA__):
 *   FOR_SALE, FOR_RENT, PENDING, SOLD, RECENTLY_SOLD, OFF_MARKET,
 *   COMING_SOON, AUCTION, FORECLOSURE, OTHER.
 */
function homeStatusToString(homeStatus: unknown): string | null {
  if (typeof homeStatus !== "string") return null;
  const norm = homeStatus.trim().toUpperCase();
  if (!norm) return null;
  if (norm === "FOR_SALE" || norm === "COMING_SOON") return "Active";
  if (norm === "FOR_RENT") return "Active";
  if (norm === "PENDING" || norm === "AUCTION") return "Pending";
  if (norm === "SOLD" || norm === "RECENTLY_SOLD") return "Sold";
  if (norm === "OFF_MARKET") return "Off Market";
  return null;
}

function parseFromNextData(nextData: any): Partial<ListingParsedData> | null {
  if (!nextData) return null;

  // Best-effort: hunt for common listing keys.
  const addressCandidates = deepFind(nextData, (k) =>
    ["address", "streetAddress", "fullAddress"].includes(k)
  );
  const cityCandidates = deepFind(nextData, (k) => k.toLowerCase() === "city");
  const stateCandidates = deepFind(nextData, (k) =>
    ["state", "statecode", "region"].includes(k.toLowerCase())
  );
  const zipCandidates = deepFind(nextData, (k) =>
    ["zipcode", "zip", "postalcode"].includes(k.toLowerCase())
  );

  const priceCandidates = deepFind(nextData, (k) =>
    ["price", "unformattedprice", "listprice"].includes(k.toLowerCase())
  );
  const bedsCandidates = deepFind(nextData, (k) => k.toLowerCase() === "beds");
  const bathsCandidates = deepFind(nextData, (k) =>
    ["baths", "bathrooms"].includes(k.toLowerCase())
  );
  const sqftCandidates = deepFind(nextData, (k) =>
    ["sqft", "livingarea", "livingareasqft"].includes(k.toLowerCase())
  );
  const yearCandidates = deepFind(nextData, (k) =>
    ["yearbuilt", "year_built"].includes(k.toLowerCase())
  );
  const lotCandidates = deepFind(nextData, (k) =>
    ["lotsize", "lotsizesqft", "lot_size"].includes(k.toLowerCase())
  );
  const latCandidates = deepFind(nextData, (k) =>
    ["lat", "latitude"].includes(k.toLowerCase())
  );
  const lngCandidates = deepFind(nextData, (k) =>
    ["lng", "longitude"].includes(k.toLowerCase())
  );
  const typeCandidates = deepFind(nextData, (k) =>
    ["propertytype", "homeType", "home_type"].includes(k.toLowerCase())
  );
  // Zillow's __NEXT_DATA__ has `homeStatus` (FOR_SALE / PENDING / SOLD)
  // — the most reliable listing-status signal short of MLS data.
  const statusCandidates = deepFind(nextData, (k) =>
    ["homestatus", "home_status", "listingstatus", "listing_status", "status"].includes(
      k.toLowerCase()
    )
  );

  const address = getString(addressCandidates.find((v) => typeof v === "string"));
  const rawStatus = statusCandidates.find((v) => typeof v === "string") as
    | string
    | undefined;

  return {
    address: address ?? null,
    city: getString(cityCandidates.find((v) => typeof v === "string")),
    state: getString(stateCandidates.find((v) => typeof v === "string")),
    zip_code: getString(zipCandidates.find((v) => typeof v === "string")),
    price: num(priceCandidates.find((v) => v != null)),
    beds: num(bedsCandidates.find((v) => v != null)),
    baths: num(bathsCandidates.find((v) => v != null)),
    sqft: num(sqftCandidates.find((v) => v != null)),
    year_built: num(yearCandidates.find((v) => v != null)),
    lot_size: num(lotCandidates.find((v) => v != null)),
    lat: num(latCandidates.find((v) => v != null)),
    lng: num(lngCandidates.find((v) => v != null)),
    property_type: getString(typeCandidates.find((v) => typeof v === "string")),
    listing_status: homeStatusToString(rawStatus),
  };
}

function extractMetaPrice(html: string): number | null {
  // Common OG/product meta tags
  const patterns = [
    /<meta[^>]+property=["']og:price:amount["'][^>]+content=["']([^"']+)["'][^>]*>/i,
    /<meta[^>]+property=["']product:price:amount["'][^>]+content=["']([^"']+)["'][^>]*>/i,
    /<meta[^>]+name=["']twitter:data1["'][^>]+content=["']([^"']+)["'][^>]*>/i,
  ];
  for (const re of patterns) {
    const m = html.match(re);
    if (m?.[1]) {
      const v = num(m[1]);
      if (v) return v;
    }
  }

  // Some pages only expose price inside og:description
  const desc = html.match(
    /<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']+)["'][^>]*>/i
  )?.[1];
  if (desc) {
    const m = desc.match(/\$([\d,]{3,})/);
    if (m?.[1]) {
      const v = num(m[1]);
      if (v) return v;
    }
  }

  return null;
}

function extractTextPrice(html: string): number | null {
  // Zillow often includes "Sold for $900,000" or "$900,000" in visible text.
  const sold = html.match(/Sold for\s*\$([\d,]+)/i);
  if (sold?.[1]) return num(sold[1]);

  // As a fallback, take the first 6+ digit money amount on the page.
  const any = html.match(/\$([\d,]{6,})/);
  if (any?.[1]) return num(any[1]);

  return null;
}

function extractBedsBathsSqftFromText(html: string): {
  beds: number | null;
  baths: number | null;
  sqft: number | null;
} {
  const beds = html.match(/(\d+(?:\.\d+)?)\s*beds?/i);
  const baths = html.match(/(\d+(?:\.\d+)?)\s*baths?/i);
  const sqft = html.match(/([\d,]+)\s*sqft/i);
  return {
    beds: beds?.[1] ? num(beds[1]) : null,
    baths: baths?.[1] ? num(baths[1]) : null,
    sqft: sqft?.[1] ? num(sqft[1]) : null,
  };
}

export async function fetchAndParseListing(
  listingUrl: string
): Promise<ListingParsedData | null> {
  const platform = detectPlatform(listingUrl);
  if (!platform) return null;

  // Gate remote fetch behind an env flag (avoids accidental scraping in prod).
  if (process.env.LISTING_FETCH_ENABLED !== "true") return null;

  const res = await fetch(listingUrl, {
    headers: {
      "user-agent":
        "Mozilla/5.0 (compatible; LeadSmartAI/1.0; +https://closebossai.com)",
      "accept-language": "en-US,en;q=0.9",
    },
    redirect: "follow",
    cache: "no-store",
  });

  if (!res.ok) return null;
  const html = await res.text();
  const metaPrice = extractMetaPrice(html);
  const textPrice = extractTextPrice(html);

  const jsonlds = extractJsonLd(html);
  const fromLd = parseFromJsonLd(jsonlds);
  // Always pull __NEXT_DATA__ too — even when JSON-LD has the facts,
  // it's often missing the listing-status signal that __NEXT_DATA__
  // exposes via `homeStatus`. We coalesce status from whichever side
  // has it, JSON-LD first (when present), Next-data as fallback.
  const nextData = extractNextData(html);
  const fromNext = parseFromNextData(nextData);

  if (fromLd) {
    return {
      address: fromLd.address ?? fromNext?.address ?? null,
      city: fromLd.city ?? fromNext?.city ?? null,
      state: fromLd.state ?? fromNext?.state ?? null,
      zip_code: fromLd.zip_code ?? fromNext?.zip_code ?? null,
      lat: fromLd.lat ?? fromNext?.lat ?? null,
      lng: fromLd.lng ?? fromNext?.lng ?? null,
      property_type: fromLd.property_type ?? fromNext?.property_type ?? null,
      beds: fromLd.beds ?? fromNext?.beds ?? null,
      baths: fromLd.baths ?? fromNext?.baths ?? null,
      sqft: fromLd.sqft ?? fromNext?.sqft ?? null,
      lot_size: fromLd.lot_size ?? fromNext?.lot_size ?? null,
      year_built: fromLd.year_built ?? fromNext?.year_built ?? null,
      price: fromLd.price ?? fromNext?.price ?? metaPrice ?? textPrice ?? null,
      rent_estimate: null,
      // Status: JSON-LD's schema.org availability first, then
      // Zillow-specific homeStatus from __NEXT_DATA__. Either is a
      // valid scrape-derived signal — the route still labels them
      // as "scrape" so the client banner stays honest.
      listing_status: fromLd.listing_status ?? fromNext?.listing_status ?? null,
      source_url: listingUrl,
      source_platform: platform,
      raw: { jsonld: jsonlds },
    };
  }

  if (fromNext) {
    return {
      address: fromNext.address ?? null,
      city: fromNext.city ?? null,
      state: fromNext.state ?? null,
      zip_code: fromNext.zip_code ?? null,
      lat: fromNext.lat ?? null,
      lng: fromNext.lng ?? null,
      property_type: fromNext.property_type ?? null,
      beds: fromNext.beds ?? null,
      baths: fromNext.baths ?? null,
      sqft: fromNext.sqft ?? null,
      lot_size: fromNext.lot_size ?? null,
      year_built: fromNext.year_built ?? null,
      price: fromNext.price ?? metaPrice ?? textPrice ?? null,
      rent_estimate: null,
      listing_status: fromNext.listing_status ?? null,
      source_url: listingUrl,
      source_platform: platform,
      raw: { nextData },
    };
  }

  // Last-resort: if the page was fetched but embedded JSON isn't available (or blocked),
  // still return any price/beds/baths/sqft we can infer from rendered text.
  const inferred = extractBedsBathsSqftFromText(html);
  if (metaPrice || textPrice || inferred.beds || inferred.baths || inferred.sqft) {
    return {
      address: null,
      city: null,
      state: null,
      zip_code: null,
      lat: null,
      lng: null,
      property_type: null,
      beds: inferred.beds,
      baths: inferred.baths,
      sqft: inferred.sqft,
      lot_size: null,
      year_built: null,
      price: metaPrice ?? textPrice ?? null,
      rent_estimate: null,
      listing_status: null,
      source_url: listingUrl,
      source_platform: platform,
      raw: { inferred: true },
    };
  }

  return null;
}

