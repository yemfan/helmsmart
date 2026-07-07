import "server-only";

/**
 * Minimal, dependency-free delimited-text parsing helpers for the warehouse
 * connectors. Zillow files are comma CSV (with quoted RegionName fields that
 * contain embedded commas, e.g. "New York, NY"); Redfin files are tab TSV
 * (quoted string fields) and gzipped.
 *
 * We avoid pulling in a CSV library — a small, robust hand-rolled splitter that
 * honors double-quotes is enough for these well-formed, machine-generated files.
 */

/**
 * Split one delimited line into fields, honoring double-quoted fields that may
 * contain the delimiter. Doubled quotes ("") inside a quoted field become a
 * single quote. Works for both comma (Zillow) and tab (Redfin) delimiters.
 */
export function splitDelimitedLine(line: string, delimiter: string): string[] {
  const out: string[] = [];
  let field = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          field += '"';
          i++; // skip the escaped quote
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === delimiter) {
      out.push(field);
      field = "";
    } else {
      field += ch;
    }
  }
  out.push(field);
  return out;
}

/**
 * Split raw text into non-empty lines, tolerant of CRLF and a trailing newline.
 */
export function toLines(text: string): string[] {
  return text.split(/\r?\n/).filter((l) => l.length > 0);
}

/**
 * Parse a numeric cell that may be empty, ".", "NA", or a plain number.
 * Returns null for anything non-finite so gaps become null values rather than 0.
 */
export function parseNum(raw: string | undefined): number | null {
  if (raw == null) return null;
  const s = raw.trim();
  if (s === "" || s === "." || s === "NA" || s === "null") return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

/**
 * Fetch a URL and return its body as a UTF-8 string. Used for the (uncompressed)
 * Zillow CSVs. Throws on non-2xx so the orchestrator can record a per-source error.
 */
export async function fetchText(url: string): Promise<string> {
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`GET ${url} → ${res.status}`);
  return res.text();
}

/**
 * Fetch a gzipped URL and return the gunzipped body as a UTF-8 string. Used for
 * the Redfin .tsv000.gz market-tracker files. Uses node's zlib (no new deps).
 */
export async function fetchGunzippedText(url: string): Promise<string> {
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`GET ${url} → ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  const { gunzipSync } = await import("node:zlib");
  return gunzipSync(buf).toString("utf-8");
}

/** Map a US state's full name to its 2-letter USPS code (+ DC). */
export const STATE_NAME_TO_CODE: Record<string, string> = {
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
