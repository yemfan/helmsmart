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

type ExtraAliases = Partial<Record<keyof ColumnMapping, string[]>>;

/**
 * Map CSV headers to our fields. `extra` (from a chosen CRM preset) supplies
 * additional aliases that take priority over the generic set for that run.
 */
export function autoMapHeaders(
  headers: string[],
  extra?: ExtraAliases,
): Partial<Record<keyof ColumnMapping, string>> {
  const normed = headers.map((raw) => ({ raw, n: norm(raw) }));
  const used = new Set<string>();
  const out: Partial<Record<keyof ColumnMapping, string>> = {};

  for (const field of FIELD_ORDER) {
    const aliases = [...(extra?.[field] ?? []).map(norm), ...ALIASES[field]];
    for (const alias of aliases) {
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

/**
 * CRM import presets. "Auto-detect" uses the generic aliases; a named CRM layers
 * on its own quirks. Kept correct + conservative — only headers whose meaning
 * actually matches our field (e.g. Follow Up Boss "Stage" is a pipeline stage,
 * NOT a buyer/seller type, so it's intentionally not mapped to lead_type).
 */
export const IMPORT_PRESETS: {
  key: string;
  label: string;
  extra?: ExtraAliases;
}[] = [
  { key: "auto", label: "Auto-detect" },
  {
    key: "boldtrail",
    label: "BoldTrail / kvCORE",
    extra: { lead_type: ["lead type"], tags: ["hashtags"], search_location: ["areas of interest"] },
  },
  {
    key: "followupboss",
    label: "Follow Up Boss",
    extra: { email: ["emails"], phone: ["phones"], notes: ["background"], source: ["source"] },
  },
  {
    key: "chime",
    label: "Chime",
    extra: { source: ["lead source"], lead_type: ["contact type"], notes: ["note"] },
  },
  { key: "other", label: "Other / generic" },
];

export function presetExtra(key: string): ExtraAliases | undefined {
  return IMPORT_PRESETS.find((p) => p.key === key)?.extra;
}
