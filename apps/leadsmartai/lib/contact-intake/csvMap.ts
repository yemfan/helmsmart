import type { ContactFieldsInput } from "./types";

/** Maps our contact fields to the CSV column header selected by the user.
 *  Each value is the header of the column that feeds that field. */
export type ColumnMapping = {
  name?: string | null;
  /** For exports that split the name — combined into `name` when no full-name
   *  column is mapped. */
  first_name?: string | null;
  last_name?: string | null;
  email?: string | null;
  phone?: string | null;
  property_address?: string | null;
  notes?: string | null;
  source?: string | null;
  lead_type?: string | null;
  search_location?: string | null;
  city?: string | null;
  state?: string | null;
  timeline?: string | null;
  price_min?: string | null;
  price_max?: string | null;
  beds?: string | null;
  baths?: string | null;
  tags?: string | null;
};

/** Normalize a CRM's buyer/seller/renter value to our vocabulary. Falls back to
 *  the trimmed original (capped) so an unrecognized label isn't dropped. */
function normalizeLeadType(v: string): string | null {
  const s = v.toLowerCase();
  if (!s.trim()) return null;
  if (/\bbuy/.test(s)) return "buyer";
  if (/\b(sell|list)/.test(s)) return "seller";
  if (/\b(rent|tenant|lease)/.test(s)) return "renter";
  return v.trim().slice(0, 40);
}

/** Parse a money/count string to a positive number, honoring K/M shorthand
 *  common in CRM exports ("$800,000", "800k", "1.2M"). Null when not numeric. */
function toNumber(v: string): number | null {
  if (!v) return null;
  const s = v.trim().toLowerCase();
  const mult = /(m\b|million)/.test(s) ? 1_000_000 : /(k\b|thousand)/.test(s) ? 1_000 : 1;
  const n = Number(s.replace(/[^0-9.]/g, ""));
  if (!Number.isFinite(n) || n <= 0) return null;
  return n * mult;
}

/** Split a delimited tags cell (comma / semicolon / pipe) into a clean list. */
function toTags(v: string): string[] | null {
  const parts = v
    .split(/[;,|]/)
    .map((t) => t.trim())
    .filter(Boolean);
  if (parts.length === 0) return null;
  return Array.from(new Set(parts)).slice(0, 20);
}

export function rowToContactFields(raw: Record<string, string>, mapping: ColumnMapping): ContactFieldsInput {
  const get = (key: string | null | undefined) => {
    if (!key) return "";
    return String(raw[key] ?? "").trim();
  };
  const text = (key: string | null | undefined) => get(key) || null;
  const intNum = (key: string | null | undefined) => {
    const n = toNumber(get(key));
    return n == null ? null : Math.round(n);
  };

  // Full-name column wins; otherwise stitch first + last together.
  const name =
    text(mapping.name) ||
    [get(mapping.first_name), get(mapping.last_name)].filter(Boolean).join(" ").trim() ||
    null;

  return {
    name,
    email: text(mapping.email),
    phone: text(mapping.phone),
    property_address: text(mapping.property_address),
    notes: text(mapping.notes),
    source: text(mapping.source),
    lead_type: normalizeLeadType(get(mapping.lead_type)),
    search_location: text(mapping.search_location),
    city: text(mapping.city),
    state: text(mapping.state),
    timeline: text(mapping.timeline),
    price_min: toNumber(get(mapping.price_min)),
    price_max: toNumber(get(mapping.price_max)),
    beds: intNum(mapping.beds),
    baths: toNumber(get(mapping.baths)),
    tags: toTags(get(mapping.tags)),
  };
}
