import "server-only";

import { dreUrl, parseDrePage, type DreRecord } from "./ca-dre";
import { hasPublicRecord } from "@/lib/teams/license";

/**
 * Public license records, free: fetch the regulator's own page and read
 * it. California today (the DRE lookup takes a license id in the URL);
 * other states return "unsupported" until their lookup is wired.
 *
 * The regulator's page is fetched once per save, with a real user agent
 * and a short timeout. A failure is "error", never "not found": a slow
 * government site must not tell an agent their license does not exist.
 */

export type LookupResult = { kind: "found"; record: DreRecord } | { kind: "not_found" } | { kind: "unsupported" } | { kind: "error"; message: string };

export async function lookupLicenseRecord(state: string, number: string): Promise<LookupResult> {
  if (!hasPublicRecord(state)) return { kind: "unsupported" };
  const id = number.replace(/\D/g, "");
  if (id.length !== 8) return { kind: "not_found" };
  try {
    const res = await fetch(dreUrl(id), {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; CloseBoss/1.0; +https://www.closebossai.com)", Accept: "text/html" },
      signal: AbortSignal.timeout(10_000),
      cache: "no-store",
    });
    if (!res.ok) return { kind: "error", message: `dre ${res.status}` };
    const html = await res.text();
    const record = parseDrePage(html);
    return record ? { kind: "found", record } : { kind: "not_found" };
  } catch (e) {
    return { kind: "error", message: e instanceof Error ? e.message : String(e) };
  }
}
