import "server-only";

import { getAnthropicClient, isAnthropicConfigured } from "./anthropic";
import {
  extractJson,
  repairJsonToObject,
  num,
  numOrNull,
  strOrNull,
  httpUrl,
} from "./jsonExtract";

/**
 * AI property-facts lookup — the Claude + web_search replacement for the
 * RentCast `/v1/listings/sale` + `/v1/properties` calls. Given a single
 * address, Claude searches public listing sites (Redfin, Realtor.com, Zillow,
 * county records) and returns the property's facts + current listing status.
 *
 * IMPORTANT — no fabrication. Claude is instructed to return null for anything
 * it cannot find on a real page it actually visited, and to cite its sources.
 * Callers treat null fields as "unknown" and must not act on invented numbers
 * (this preserves the exact contract the old RentCast path guaranteed).
 *
 * This is slower than a structured API (~15-40s). Callers MUST cache it — e.g.
 * both apps wrap it behind a property_cache with a long TTL, so a cache hit
 * never reaches here.
 */

const MODEL = "claude-sonnet-4-6";
const MAX_TOOL_ROUNDS = 5;

/** Canonical listing states we normalize the model's free text into. */
export type PropertyListingStatus =
  | "active"
  | "pending"
  | "sold"
  | "off_market"
  | null;

export interface PropertyFacts {
  address: string;
  city: string | null;
  state: string | null;
  zip: string | null;
  beds: number | null;
  baths: number | null;
  sqft: number | null;
  /** List price when currently for sale, else the last known sale price. */
  price: number | null;
  listingStatus: PropertyListingStatus;
  /** A real listing/detail page URL the model actually saw (never guessed). */
  listingUrl: string | null;
  listingAgentName: string | null;
  mlsNumber: string | null;
  mlsName: string | null;
  yearBuilt: number | null;
  lotSizeSqft: number | null;
  propertyType: string | null;
  lat: number | null;
  lng: number | null;
  sources: { title: string; url: string }[];
}

export type PropertyLookupResult =
  | { ok: true; facts: PropertyFacts }
  | { ok: false; status: number; error: string };

export const AI_PROPERTY_LOOKUP_DISCLAIMER =
  "Property facts gathered by AI from public listing sites — verify against the MLS or county record before relying on them.";

const SYSTEM_PROMPT = `You are a real-estate research assistant. Given a property address, use the web_search tool to find that specific property's facts from public sources (Redfin, Realtor.com, Zillow, county assessor records). Do NOT rely on memory.

Rules:
- Return ONLY facts you actually find for THIS address on a real page you visited. NEVER invent a value. Use null for anything you cannot verify.
- listingStatus must be one of: "active" (currently for sale / coming soon / active under contract), "pending" (in escrow / contingent), "sold" (recently sold, not currently listed), "off_market" (not for sale, e.g. an owner record), or null if unknown.
- price: the current list price if it's for sale, otherwise the most recent sale price. Null if unknown.
- listingUrl: the real detail-page URL you saw (Redfin/Realtor/Zillow/MLS). Null if you didn't find a real page.
- lotSizeSqft is in square feet. For condos/townhomes lotSizeSqft is usually null.
- Only include a listing agent name if it's shown on a real listing page.

When done searching, respond with EXACTLY ONE fenced JSON code block and nothing after it (numbers only, no $ or commas):

\`\`\`json
{
  "address": "",
  "city": null, "state": null, "zip": null,
  "beds": null, "baths": null, "sqft": null,
  "price": null, "listingStatus": null, "listingUrl": null,
  "listingAgentName": null, "mlsNumber": null, "mlsName": null,
  "yearBuilt": null, "lotSizeSqft": null, "propertyType": null,
  "lat": null, "lng": null,
  "sources": [ { "title": "", "url": "" } ]
}
\`\`\``;

type WebTool = { type: string; name: string; max_uses?: number };

/** Fetch AI-sourced property facts for a single address. */
export async function aiPropertyLookup(address: string): Promise<PropertyLookupResult> {
  const addr = (address ?? "").trim();
  if (!addr) return { ok: false, status: 400, error: "Address is required." };
  if (!isAnthropicConfigured()) {
    return { ok: false, status: 500, error: "AI property lookup is unavailable — ANTHROPIC_API_KEY is not configured." };
  }

  const client = getAnthropicClient();

  const userPrompt =
    `Find the property facts for this address:\n\nAddress: ${addr}\n\n` +
    `Search the web for this specific property's listing/record, then return the JSON.`;

  const tools = [{ type: "web_search_20250305", name: "web_search", max_uses: 5 } as WebTool];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const messages: any[] = [{ role: "user", content: userPrompt }];

  let finalText = "";
  let sawText = false;
  try {
    for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const res: any = await client.messages.create({
        model: MODEL,
        max_tokens: 4000,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        thinking: { type: "adaptive" } as any,
        system: SYSTEM_PROMPT,
        messages,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        tools: tools as any,
      });

      const content: unknown[] = Array.isArray(res?.content) ? res.content : [];
      for (const block of content) {
        const b = block as { type?: string; text?: string };
        if (b.type === "text" && typeof b.text === "string") {
          finalText += b.text;
          sawText = true;
        }
      }

      if (res?.stop_reason === "pause_turn") {
        messages.push({ role: "assistant", content: res.content });
        continue;
      }
      break;
    }
  } catch (e) {
    return {
      ok: false,
      status: 502,
      error: `AI property lookup failed: ${e instanceof Error ? e.message : "unknown error"}`,
    };
  }

  if (!sawText) {
    return { ok: false, status: 502, error: "AI property lookup returned no usable result." };
  }

  let parsed = extractJson(finalText);
  if (!parsed) {
    parsed = await repairJsonToObject(
      client,
      MODEL,
      finalText,
      "Extract the property facts into ONE valid JSON object with keys address, city, state, zip, beds, baths, sqft, price, listingStatus, listingUrl, listingAgentName, mlsNumber, mlsName, yearBuilt, lotSizeSqft, propertyType, lat, lng, sources. Use ONLY values already present below — do not invent. Use null for anything genuinely absent.",
    );
  }
  if (!parsed) {
    return { ok: false, status: 502, error: "Could not parse the AI property lookup result." };
  }

  return { ok: true, facts: normalizeFacts(parsed, addr) };
}

function normalizeListingStatus(v: unknown): PropertyListingStatus {
  const s = strOrNull(v)?.toLowerCase();
  if (!s) return null;
  if (/pending|contingent|escrow|under contract/.test(s)) return "pending";
  if (/active|for sale|coming soon|new listing/.test(s)) return "active";
  if (/sold|closed/.test(s)) return "sold";
  if (/off.?market|not for sale|owner/.test(s)) return "off_market";
  return null;
}

function normalizeFacts(raw: Record<string, unknown>, fallbackAddress: string): PropertyFacts {
  const rawSources = Array.isArray(raw.sources) ? raw.sources : [];
  const sources = rawSources
    .map((s) => {
      const o = (s ?? {}) as Record<string, unknown>;
      const url = httpUrl(o.url);
      return url ? { title: strOrNull(o.title) ?? url, url } : null;
    })
    .filter((s): s is { title: string; url: string } => s !== null);

  return {
    address: strOrNull(raw.address) ?? fallbackAddress,
    city: strOrNull(raw.city),
    state: strOrNull(raw.state),
    zip: strOrNull(raw.zip),
    beds: numOrNull(raw.beds),
    baths: numOrNull(raw.baths),
    sqft: numOrNull(raw.sqft),
    price: numOrNull(raw.price),
    listingStatus: normalizeListingStatus(raw.listingStatus),
    listingUrl: httpUrl(raw.listingUrl),
    listingAgentName: strOrNull(raw.listingAgentName),
    mlsNumber: strOrNull(raw.mlsNumber),
    mlsName: strOrNull(raw.mlsName),
    yearBuilt: numOrNull(raw.yearBuilt),
    lotSizeSqft: numOrNull(raw.lotSizeSqft),
    propertyType: strOrNull(raw.propertyType),
    lat: latLng(raw.lat),
    lng: latLng(raw.lng),
    sources,
  };
}

/** Accept only a plausible coordinate; the model sometimes returns 0/garbage. */
function latLng(v: unknown): number | null {
  const n = numOrNull(v);
  if (n == null || n === 0) return null;
  return Math.abs(n) <= 180 ? n : null;
}
