/**
 * Structured-params → natural-language brief for the public AI house search.
 *
 * Replicates the logic of `criteriaToBrief` in lib/contacts/listings/
 * listingSearch.ts (which is server-only + typed to SavedSearchCriteria) so the
 * public /homes surface can translate legacy deep-link params
 * (?city=&state=&zip=&priceMin=&priceMax=&bedsMin=&bathsMin=&sqftMin=&propertyType=)
 * into the same kind of brief the AI engine expects. Kept dependency-free so it
 * can run in both the server route and the client component.
 */

export type HomeSearchParams = {
  city?: string | null;
  state?: string | null;
  zip?: string | null;
  priceMin?: number | null;
  priceMax?: number | null;
  bedsMin?: number | null;
  bathsMin?: number | null;
  sqftMin?: number | null;
  propertyType?: string | null;
};

const PROPERTY_TYPE_LABELS: Record<string, string> = {
  single_family: "single-family",
  condo: "condo",
  townhouse: "townhouse",
  multi_family: "multi-family",
  land: "land",
  other: "",
};

/**
 * Build a natural-language buyer brief from structured params. Returns null
 * when there's nothing meaningful to search on (so callers never auto-run an
 * unbounded nationwide search).
 */
export function paramsToBrief(p: HomeSearchParams): string | null {
  const city = p.city?.trim() || "";
  const state = p.state?.trim() || "";
  const zip = p.zip?.trim() || "";

  const location: string[] = [];
  if (city) location.push(city);
  if (state) location.push(state);
  const locStr = location.join(", ");
  const withZip = zip ? `${locStr}${locStr ? " " : ""}${zip}`.trim() : locStr;

  const parts: string[] = [];
  parts.push(withZip ? `Homes for sale in ${withZip}` : "Homes for sale");

  const bedsMin = p.bedsMin ?? null;
  if (bedsMin && bedsMin > 0) parts.push(`${bedsMin}+ beds`);
  const bathsMin = p.bathsMin ?? null;
  if (bathsMin && bathsMin > 0) parts.push(`${bathsMin}+ baths`);

  const priceMin = p.priceMin ?? null;
  const priceMax = p.priceMax ?? null;
  if (priceMin && priceMax) {
    parts.push(`priced $${priceMin.toLocaleString()}-$${priceMax.toLocaleString()}`);
  } else if (priceMax) {
    parts.push(`priced under $${priceMax.toLocaleString()}`);
  } else if (priceMin) {
    parts.push(`priced over $${priceMin.toLocaleString()}`);
  }

  const sqftMin = p.sqftMin ?? null;
  if (sqftMin && sqftMin > 0) parts.push(`at least ${sqftMin.toLocaleString()} sqft`);

  const propertyType = p.propertyType?.trim() || "";
  if (propertyType && propertyType !== "any") {
    const label = PROPERTY_TYPE_LABELS[propertyType];
    // Unknown/blank-mapped types are skipped rather than echoed verbatim.
    if (label) parts.push(label);
  }

  const hasSignal =
    !!withZip ||
    (!!bedsMin && bedsMin > 0) ||
    (!!bathsMin && bathsMin > 0) ||
    !!priceMin ||
    !!priceMax ||
    (!!sqftMin && sqftMin > 0) ||
    (!!propertyType && propertyType !== "any" && !!PROPERTY_TYPE_LABELS[propertyType]);
  if (!hasSignal) return null;

  return `${parts.join(", ")}.`;
}
