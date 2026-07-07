import "server-only";

import type { ActiveGeography } from "./read";

/**
 * URL-slug helpers for the Data Center market pages.
 *
 * State slug  = lowercased full state name with hyphens ('california').
 * Metro slug  = slugify(geo_name), e.g. "Los Angeles, CA" -> 'los-angeles-ca'.
 *
 * Metro `geo_code` is an opaque Zillow RegionID, so we can't derive a pretty URL
 * from it -- resolution (slug -> geography) is done by listing the level's active
 * geographies and matching on the computed slug (see read.ts).
 */

/** Map a US state's full name to its 2-letter USPS code (+ DC). */
const STATE_NAME_TO_CODE: Record<string, string> = {
  Alabama: "AL",
  Alaska: "AK",
  Arizona: "AZ",
  Arkansas: "AR",
  California: "CA",
  Colorado: "CO",
  Connecticut: "CT",
  Delaware: "DE",
  "District of Columbia": "DC",
  Florida: "FL",
  Georgia: "GA",
  Hawaii: "HI",
  Idaho: "ID",
  Illinois: "IL",
  Indiana: "IN",
  Iowa: "IA",
  Kansas: "KS",
  Kentucky: "KY",
  Louisiana: "LA",
  Maine: "ME",
  Maryland: "MD",
  Massachusetts: "MA",
  Michigan: "MI",
  Minnesota: "MN",
  Mississippi: "MS",
  Missouri: "MO",
  Montana: "MT",
  Nebraska: "NE",
  Nevada: "NV",
  "New Hampshire": "NH",
  "New Jersey": "NJ",
  "New Mexico": "NM",
  "New York": "NY",
  "North Carolina": "NC",
  "North Dakota": "ND",
  Ohio: "OH",
  Oklahoma: "OK",
  Oregon: "OR",
  Pennsylvania: "PA",
  "Rhode Island": "RI",
  "South Carolina": "SC",
  "South Dakota": "SD",
  Tennessee: "TN",
  Texas: "TX",
  Utah: "UT",
  Vermont: "VT",
  Virginia: "VA",
  Washington: "WA",
  "West Virginia": "WV",
  Wisconsin: "WI",
  Wyoming: "WY",
};

/** 2-letter state code -> full state name (inverse of STATE_NAME_TO_CODE). */
export const STATE_CODE_TO_NAME: Record<string, string> = Object.fromEntries(
  Object.entries(STATE_NAME_TO_CODE).map(([name, code]) => [code, name]),
);

/** Lowercase, strip accents/punctuation, collapse whitespace/commas to hyphens. */
export function slugify(input: string): string {
  return input
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/**
 * Slug for a state. Accepts either a 2-letter code ('CA') or a full name
 * ('California'). Returns '' if it can't resolve a name.
 */
export function stateSlug(codeOrName: string): string {
  const raw = codeOrName.trim();
  const name = raw.length === 2 ? STATE_CODE_TO_NAME[raw.toUpperCase()] : raw;
  return name ? slugify(name) : "";
}

/** Human-readable state name from a 2-letter code (falls back to the code). */
export function stateName(code: string): string {
  return STATE_CODE_TO_NAME[code.toUpperCase()] ?? code;
}

/** Slug for any active geography row. */
export function geoSlug(geo: ActiveGeography): string {
  if (geo.geo_level === "state") {
    // state geo_code is the 2-letter code; geo_name is the full name.
    return stateSlug(geo.geo_name || geo.geo_code);
  }
  if (geo.geo_level === "metro") {
    return slugify(geo.geo_name);
  }
  return slugify(geo.geo_name || geo.geo_code);
}
