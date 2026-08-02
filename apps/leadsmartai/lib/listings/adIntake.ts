import "server-only";

import { getAnthropicClient } from "@/lib/anthropic";
import { supabaseAdmin } from "@/lib/supabase/admin";
import type { ListingAdFacts } from "@/lib/listings/types";
import { scrapeConfigured, fetchRenderedHtml, extractPhotoUrls, htmlToText } from "@/lib/listings/photoScrape";

/**
 * Listing ad intake — pull the photos + property facts a video ad needs from a
 * listing's MLS URL, using Claude's server-side web_fetch tool.
 *
 * Reality check baked into the design: MLS/portal pages (Zillow, Realtor.com,
 * Redfin, Matrix/FlexMLS) frequently block bots or render photos via JS the
 * fetch can't see. So this is BEST-EFFORT — everything comes back nullable, we
 * report a confidence + warnings, and the caller lets the agent fill gaps /
 * upload photos. We never fabricate a fact the page didn't show.
 */

const MODEL = "claude-opus-5";

const SCHEMA_DESCRIPTION = `
Return JSON with EXACTLY this shape. Every field may be null (or [] for arrays) if the page doesn't show it:

{
  "beds": number | null,
  "baths": number | null,            // may be fractional, e.g. 2.5
  "sqft": number | null,             // living area, integer
  "yearBuilt": number | null,
  "price": number | null,            // integer dollars, no commas or $
  "address": string | null,          // street address
  "city": string | null,
  "state": string | null,            // 2-letter code
  "description": string | null,      // the listing's marketing description / remarks, verbatim if present
  "highlights": string[],            // 3-6 short selling-point phrases (e.g. "Chef's kitchen", "Walk to downtown"). [] if none.
  "photoUrls": string[],             // ABSOLUTE URLs of the property photos found on the page, deduped, up to 12. [] if none found.
  "confidence": number,              // 0-1 — 0.8+ if the page clearly rendered with photos+facts, <0.4 if blocked/thin
  "warnings": string[]               // e.g. "page appears to block automated access", "no photos found in fetched HTML"
}

Return ONLY this JSON as your final message. No prose, no markdown, no code fences.
`;

const SYSTEM_PROMPT =
  "You extract real-estate listing facts + photo URLs from a listing web page for an agent building a video ad of THEIR OWN listing. " +
  "Fetch the given URL with web_fetch, then read off ONLY what the page actually shows. Be conservative: null over a guess. " +
  "For photoUrls, return absolute image URLs of the PROPERTY photos (not logos, agent headshots, map tiles, or ad pixels). " +
  "If the page blocks access or is nearly empty, say so in warnings and return low confidence — do not invent a listing.";

type Block = { type: string; text?: string };

/**
 * Pull a listing's facts + photos from its URL. Prefers the scrape API (renders
 * the page past the portal bot-wall, so we actually get the real photo gallery +
 * facts); falls back to Claude's web_fetch when scraping isn't configured (which
 * the big portals 403, but non-portal pages may still work).
 */
export async function extractListingFromUrl(url: string): Promise<ListingAdFacts> {
  if (scrapeConfigured()) {
    try {
      return await extractViaScrape(url);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Photo pull failed.";
      // Fall back to web_fetch, but keep the scrape error as a warning.
      const viaFetch = await extractViaWebFetch(url);
      return { ...viaFetch, warnings: [...viaFetch.warnings, `Scrape fallback: ${msg}`] };
    }
  }
  return extractViaWebFetch(url);
}

/**
 * Scrape path: render the page → regex the CDN photo URLs (deterministic) → have
 * Claude read the facts off the page text. This is what actually works on Zillow
 * et al., because the render gets past the bot-wall and the photos sit on public
 * CDNs.
 */
async function extractViaScrape(url: string): Promise<ListingAdFacts> {
  const html = await fetchRenderedHtml(url);
  const photoUrls = extractPhotoUrls(html);
  const text = htmlToText(html).slice(0, 16000);

  const client = getAnthropicClient();
  const res = await client.messages.create({
    model: MODEL,
    max_tokens: 1500,
    system:
      "You extract real-estate listing facts from the visible text of a listing page for the listing agent. " +
      "Read off ONLY what the text shows; null over a guess. Ignore navigation, ads, and 'similar homes'. " +
      "Return photoUrls as an empty array (photos are gathered separately).",
    messages: [{ role: "user", content: `Listing page text:\n\n${text}\n\n${SCHEMA_DESCRIPTION}` }],
  });
  const out = (res.content as unknown as Block[])
    .filter((b) => b.type === "text" && b.text)
    .map((b) => b.text as string)
    .join("\n\n");

  const facts = out.trim() ? parseFacts(out) : emptyFacts([]);
  // Photos come from the deterministic scrape, not the model.
  facts.photoUrls = photoUrls;
  if (photoUrls.length > 0 && facts.confidence < 0.6) facts.confidence = 0.6;
  if (photoUrls.length === 0) facts.warnings = [...facts.warnings, "No photos found on the page."];
  return facts;
}

/**
 * Fetch + extract from a listing URL via Claude web_fetch. Loops on `pause_turn`
 * so the server-side tool can complete before we read the final JSON.
 */
async function extractViaWebFetch(url: string): Promise<ListingAdFacts> {
  const client = getAnthropicClient();

  const messages: Array<{ role: "user" | "assistant"; content: unknown }> = [
    {
      role: "user",
      content:
        `Listing page: ${url}\n\n` +
        `Fetch it, then extract the listing's facts and photo URLs. ${SCHEMA_DESCRIPTION}`,
    },
  ];

  let text = "";
  for (let i = 0; i < 5; i++) {
    const res = await client.messages.create({
      model: MODEL,
      max_tokens: 3000,
      system: SYSTEM_PROMPT,
      messages: messages as never,
      tools: [{ type: "web_fetch_20260209", name: "web_fetch", max_uses: 3 } as never],
    });

    const blocks = res.content as unknown as Block[];
    text = blocks
      .filter((b) => b.type === "text" && b.text)
      .map((b) => b.text as string)
      .join("\n\n");

    // The server ran the tool; if it paused mid-turn, echo the turn back to resume.
    if (res.stop_reason === "pause_turn") {
      messages.push({ role: "assistant", content: res.content });
      continue;
    }
    break;
  }

  if (!text.trim()) {
    return emptyFacts(["The AI returned no data for this URL."]);
  }
  return parseFacts(text);
}

/** Persist the ad facts onto the listing row (service-role; ownership-checked by caller). */
export async function saveListingAdFacts(
  agentId: string,
  listingId: string,
  facts: ListingAdFacts,
  source: "mls_url" | "manual",
): Promise<void> {
  const { error } = await supabaseAdmin
    .from("listings")
    .update({
      beds: facts.beds,
      baths: facts.baths,
      sqft: facts.sqft,
      year_built: facts.yearBuilt,
      property_description: facts.description,
      highlights: facts.highlights,
      photo_urls: facts.photoUrls,
      ad_facts_source: source,
      ad_facts_confidence: source === "mls_url" ? facts.confidence : null,
      ad_facts_updated_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", listingId)
    .eq("agent_id", agentId);
  if (error) throw new Error(error.message);
}

// ── Parsing (tolerant; exported for unit tests) ───────────────────────

export function parseFacts(raw: string): ListingAdFacts {
  const jsonText = stripFences(raw).trim();
  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonText);
  } catch {
    return emptyFacts([`Could not parse AI response: ${raw.slice(0, 160)}`]);
  }
  if (typeof parsed !== "object" || parsed === null) {
    return emptyFacts(["AI response was not an object."]);
  }
  const p = parsed as Record<string, unknown>;
  return {
    beds: asNumber(p.beds),
    baths: asNumber(p.baths),
    sqft: asNumber(p.sqft),
    yearBuilt: asNumber(p.yearBuilt),
    price: asNumber(p.price),
    address: asString(p.address),
    city: asString(p.city),
    state: asString(p.state),
    description: asString(p.description),
    highlights: asStringArray(p.highlights).slice(0, 6),
    photoUrls: asUrlArray(p.photoUrls).slice(0, 12),
    confidence: clamp01(asNumber(p.confidence)),
    warnings: asStringArray(p.warnings),
  };
}

function emptyFacts(warnings: string[]): ListingAdFacts {
  return {
    beds: null,
    baths: null,
    sqft: null,
    yearBuilt: null,
    price: null,
    address: null,
    city: null,
    state: null,
    description: null,
    highlights: [],
    photoUrls: [],
    confidence: 0,
    warnings,
  };
}

function stripFences(s: string): string {
  const fenced = s.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
  return fenced ? fenced[1] : s;
}

function asString(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t.length ? t : null;
}

function asNumber(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string") {
    const n = Number(v.replace(/[$,\s]/g, ""));
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function asStringArray(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v.filter((x): x is string => typeof x === "string" && x.trim().length > 0).map((x) => x.trim());
}

/** Photo URLs must be absolute http(s) links; drop anything else. */
function asUrlArray(v: unknown): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const u of asStringArray(v)) {
    if (!/^https?:\/\//i.test(u) || seen.has(u)) continue;
    seen.add(u);
    out.push(u);
  }
  return out;
}

function clamp01(n: number | null): number {
  if (n === null) return 0;
  return Math.max(0, Math.min(1, n));
}
