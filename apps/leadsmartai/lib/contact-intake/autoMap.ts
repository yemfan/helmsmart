import type { ColumnMapping } from "./csvMap";

/**
 * Best-guess mapping of a CSV's headers to our contact fields, by matching each
 * field against a list of known header aliases from the big real-estate CRMs
 * (BoldTrail/kvCORE, Follow Up Boss, Chime, etc.). Users can still override every
 * field in the wizard — this just removes the tedium for a standard export.
 */

const ALIASES: Record<keyof ColumnMapping, string[]> = {
  first_name: ["first name", "firstname", "first", "given name", "fname"],
  last_name: ["last name", "lastname", "last", "surname", "family name", "lname"],
  name: ["full name", "name", "contact name", "client name", "lead name", "display name"],
  email: ["email", "email address", "e mail", "primary email", "email 1", "emails"],
  phone: [
    "phone",
    "phones",
    "cell phone",
    "cell",
    "mobile",
    "mobile phone",
    "primary phone",
    "phone number",
    "phone 1",
    "cell number",
    "mobile number",
  ],
  source: ["lead source", "source", "origin", "lead origin", "referral source"],
  lead_type: ["lead type", "contact type", "client type", "buyer seller", "type", "category"],
  search_location: [
    "area of interest",
    "search area",
    "desired area",
    "target area",
    "neighborhood",
    "area",
    "location",
  ],
  city: ["city", "town"],
  state: ["state", "province", "region"],
  timeline: ["timeline", "time frame", "timeframe", "buying timeline", "time horizon"],
  price_min: ["price min", "min price", "budget min", "min budget", "minimum price", "price low"],
  price_max: ["price max", "max price", "budget max", "max budget", "maximum price", "price high", "budget"],
  beds: ["bedrooms", "beds", "bed", "br"],
  baths: ["bathrooms", "baths", "bath", "ba"],
  tags: ["tags", "labels", "categories", "tag"],
  property_address: ["property address", "street address", "mailing address", "home address", "address", "street"],
  notes: ["notes", "note", "comments", "comment", "description", "remarks", "background"],
};

/** Assign the more-specific fields first so a broad alias can't grab a header
 *  that a narrower field wants. */
const FIELD_ORDER: (keyof ColumnMapping)[] = [
  "email",
  "first_name",
  "last_name",
  "name",
  "phone",
  "source",
  "lead_type",
  "search_location",
  "price_min",
  "price_max",
  "beds",
  "baths",
  "timeline",
  "city",
  "state",
  "tags",
  "property_address",
  "notes",
];

function norm(h: string): string {
  return h.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

export function autoMapHeaders(headers: string[]): Partial<Record<keyof ColumnMapping, string>> {
  const normed = headers.map((raw) => ({ raw, n: norm(raw) }));
  const used = new Set<string>();
  const out: Partial<Record<keyof ColumnMapping, string>> = {};

  for (const field of FIELD_ORDER) {
    for (const alias of ALIASES[field]) {
      const hit = normed.find((h) => !used.has(h.raw) && h.n === alias);
      if (hit) {
        out[field] = hit.raw;
        used.add(hit.raw);
        break;
      }
    }
  }
  return out;
}
