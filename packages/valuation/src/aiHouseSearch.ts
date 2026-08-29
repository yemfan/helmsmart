import "server-only";
import { cachedSystem, markTranscriptCached } from "@leadsmart/shared/utils/promptCache";

import { getAnthropicClient, isAnthropicConfigured } from "./anthropic";
import { extractJson, numOrNull, str, httpUrl } from "./jsonExtract";
import { HOUSE_SEARCH_DISCLAIMER } from "./types";
import type {
  HouseListing,
  HouseSearchResponse,
  HouseSearchResult,
  SearchRefinement,
} from "./types";

/**
 * AI House Search — Claude + live web search turns a buyer's natural-language
 * brief into real, currently-listed homes with cited source URLs, plus
 * suggested refinements. Same pattern as aiCma / aiPropertyLookup. Shared by
 * both apps (CloseBoss public /homes and PropertyTools /search).
 *
 * IMPORTANT — Claude is instructed to only report listings it actually finds
 * via search (each with a source URL), never to invent an address, price, or
 * listing. Sparse real results beat fabricated ones.
 */

const MODEL = "claude-opus-4-8";
const MAX_TOOL_ROUNDS = 8;

type WebTool = { type: string; name: string; max_uses?: number };

const SYSTEM_PROMPT = `You are a real-estate buyer's-agent assistant. A natural-language home search brief is given; use the web_search tool to find REAL, CURRENTLY-LISTED homes that match — do not rely on memory.

Rules:
- Only include listings you actually found via web search, each with a real listing-page source URL. NEVER invent an address, price, or listing. If you find few real matches, return fewer — do not pad with fabrications.
- listingUrl MUST be the specific listing-DETAIL page for that exact address (e.g. https://www.redfin.com/CA/Alhambra/123-Main-St-91801/home/12345678 or a Realtor.com/Zillow/MLS detail page), NOT a city/area search-results page. If you only have a generic search URL for a listing, set its listingUrl to null rather than a non-specific link.
- Honor every constraint in the brief (location, price, beds/baths, type, features). Prefer active for-sale listings.
- For each listing set matchReason to one short sentence on why it fits the buyer's brief.
- Suggest 4-6 useful refinements the agent could toggle to narrow results (e.g. "Single-family only", "Has a pool", "Under $900k", "3+ bathrooms", "Walkable to schools"). Make them specific to this brief.

When done searching, respond with EXACTLY ONE fenced JSON code block and nothing after it, matching this schema (numbers only, no $ or commas; use null when unknown):

\`\`\`json
{
  "interpreted": "one-sentence restatement of what the buyer is looking for",
  "criteria": ["concrete criterion", "..."],
  "listings": [
    { "address": "", "price": 0, "beds": 0, "baths": 0, "sqft": 0, "propertyType": null, "lotSizeSqft": null, "hoaMonthly": null, "yearBuilt": null, "listingUrl": "", "matchReason": "" }
  ],
  "refinements": ["Single-family only", "Has a pool"],
  "summary": "2-4 sentences: how many real listings were found and any caveats.",
  "sources": [ { "title": "", "url": "" } ]
}
\`\`\``;

export async function generateHouseSearch(
  query: string,
  refinements: string[] = [],
): Promise<HouseSearchResponse> {
  const brief = query.trim();
  if (!brief) return { ok: false, status: 400, error: "A search description is required." };
  if (!isAnthropicConfigured()) {
    return { ok: false, status: 500, error: "AI House Search is unavailable — ANTHROPIC_API_KEY is not configured." };
  }

  const client = getAnthropicClient();

  const refineLines = refinements
    .map((r) => r.trim())
    .filter(Boolean)
    .map((r) => `- ${r}`);
  const userPrompt =
    `Buyer's home search brief:\n\n${brief}\n` +
    (refineLines.length ? `\nAlso apply these refinements:\n${refineLines.join("\n")}\n` : "") +
    `\nSearch the web for matching for-sale listings, then return the JSON.`;

  const tools = [{ type: "web_search_20250305", name: "web_search", max_uses: 8 } as WebTool];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const messages: any[] = [{ role: "user", content: userPrompt }];

  let finalText = "";
  let sawText = false;
  try {
    for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const res: any = await client.messages.create({
        model: MODEL,
        max_tokens: 8000,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        thinking: { type: "adaptive" } as any,
        // Cached: identical on every call, and the cached prefix covers the tool
        // definitions sent ahead of it. See promptCache.ts.
        system: cachedSystem(SYSTEM_PROMPT) as never,
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
        // The turn just appended holds the web-search results. Move the
        // breakpoint onto it so the next round reads them from cache
        // rather than paying full price for them again.
        markTranscriptCached(messages);
        continue;
      }
      break;
    }
  } catch (e) {
    return {
      ok: false,
      status: 502,
      error: `AI House Search failed: ${e instanceof Error ? e.message : "unknown error"}`,
    };
  }

  if (!sawText) return { ok: false, status: 502, error: "AI House Search returned no usable result." };

  const parsed = extractJson(finalText);
  if (!parsed) return { ok: false, status: 502, error: "Could not parse the AI House Search result." };

  return { ok: true, result: normalize(parsed, brief) };
}

function normalize(raw: Record<string, unknown>, brief: string): HouseSearchResult {
  const rawListings = Array.isArray(raw.listings) ? raw.listings : [];
  const rawSources = Array.isArray(raw.sources) ? raw.sources : [];
  const rawRefinements = Array.isArray(raw.refinements) ? raw.refinements : [];
  const rawCriteria = Array.isArray(raw.criteria) ? raw.criteria : [];

  const sources = rawSources
    .map((s) => {
      const o = (s ?? {}) as Record<string, unknown>;
      const url = httpUrl(o.url);
      return url ? { title: str(o.title, url), url } : null;
    })
    .filter((s): s is { title: string; url: string } => s !== null);

  const listings = rawListings
    .map<HouseListing | null>((c) => {
      if (!c || typeof c !== "object") return null;
      const o = c as Record<string, unknown>;
      const address = str(o.address, "");
      if (!address) return null;
      const listingUrl = httpUrl(o.listingUrl);
      if (listingUrl && !sources.some((s) => s.url === listingUrl)) {
        sources.push({ title: address, url: listingUrl });
      }
      return {
        address,
        price: numOrNull(o.price),
        beds: numOrNull(o.beds),
        baths: numOrNull(o.baths),
        sqft: numOrNull(o.sqft),
        propertyType: o.propertyType == null ? null : String(o.propertyType),
        lotSizeSqft: numOrNull(o.lotSizeSqft),
        hoaMonthly: numOrNull(o.hoaMonthly),
        yearBuilt: numOrNull(o.yearBuilt),
        listingUrl,
        matchReason: o.matchReason == null ? null : String(o.matchReason),
      };
    })
    .filter((x): x is HouseListing => x !== null);

  const refinements: SearchRefinement[] = rawRefinements
    .map((r, i) => {
      const label = typeof r === "string" ? r.trim() : "";
      return label ? { id: `r${i}`, label } : null;
    })
    .filter((r): r is SearchRefinement => r !== null);

  return {
    interpreted: str(raw.interpreted, brief),
    criteria: rawCriteria.map((c) => String(c).trim()).filter(Boolean),
    listings,
    refinements,
    summary: raw.summary == null ? null : String(raw.summary),
    sources,
    disclaimer: HOUSE_SEARCH_DISCLAIMER,
  };
}
