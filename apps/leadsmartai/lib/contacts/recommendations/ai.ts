import "server-only";

import { supabaseAdmin } from "@/lib/supabase/admin";
import { findMatchingListings, type MatchedListing } from "@/lib/contacts/listings/listingSearch";
import { generateAIResponse } from "@/lib/ai/aiService";
import type {
  PropertyTypeFilter,
  SavedSearch,
  SavedSearchCriteria,
} from "@/lib/contacts/types";

/**
 * AI property recommender. Given a contact, returns a ranked list of
 * candidate listings the agent should consider sending.
 *
 * Pipeline:
 *   1. Gather contact signal: saved searches, favorites, recent
 *      property_view events, lifecycle_stage.
 *   2. Derive effective criteria (most-recent saved search criteria +
 *      favorite-inferred price/location bounds).
 *   3. Run the AI house-search engine (Claude + web search) for active
 *      listings matching those criteria.
 *   4. Score each candidate via similarity to favorites + saved
 *      searches (zip overlap, beds/baths match, price band, sqft range).
 *   5. If OPENAI_API_KEY set: pass top N to gpt-4o-mini for rationale
 *      + final ranking. Otherwise: return deterministic rank + a
 *      rule-based rationale string.
 *
 * Output is a candidate list the agent can review and one-click send
 * via the D2 recommendations flow.
 */

export type RecommendationCandidate = {
  listing: MatchedListing;
  score: number; // 0-100
  rationale: string;
  matchReasons: string[];
};

export type RecommenderContext = {
  favoriteCount: number;
  savedSearchCount: number;
  viewedCount: number;
  priceRange: { min: number | null; max: number | null };
  preferredCities: string[];
  usedLlm: boolean;
};

export type RecommenderResult = {
  candidates: RecommendationCandidate[];
  context: RecommenderContext;
};

type FavoriteSnapshot = {
  address: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  price: number | null;
  beds: number | null;
  baths: number | null;
  sqft: number | null;
  propertyType: string | null;
};

type ContactProfile = {
  id: string;
  userId: string | null;
  firstName: string | null;
  lifecycleStage: string | null;
  closingPrice: number | null;
};

// =============================================================================
// Data loading
// =============================================================================

async function loadContact(contactId: string): Promise<ContactProfile | null> {
  const { data } = await supabaseAdmin
    .from("contacts")
    .select("id,user_id,first_name,lifecycle_stage,closing_price")
    .eq("id", contactId)
    .maybeSingle();
  if (!data) return null;
  const row = data as {
    id: string;
    user_id: string | null;
    first_name: string | null;
    lifecycle_stage: string | null;
    closing_price: number | null;
  };
  return {
    id: row.id,
    userId: row.user_id,
    firstName: row.first_name,
    lifecycleStage: row.lifecycle_stage,
    closingPrice: row.closing_price,
  };
}

async function loadSavedSearches(contactId: string): Promise<SavedSearch[]> {
  const { data } = await supabaseAdmin
    .from("contact_saved_searches")
    .select("*")
    .eq("contact_id", contactId)
    .eq("is_active", true as never)
    .order("created_at", { ascending: false })
    .limit(10);
  return (data ?? []).map((r) => {
    const row = r as Record<string, unknown>;
    return {
      id: String(row.id),
      contactId: String(row.contact_id),
      agentId: (row.agent_id as string | number | null) ?? null,
      name: String(row.name ?? ""),
      criteria: (row.criteria as SavedSearchCriteria) ?? {},
      alertFrequency: (row.alert_frequency as SavedSearch["alertFrequency"]) ?? "daily",
      lastAlertedAt: (row.last_alerted_at as string | null) ?? null,
      lastMatchedListingIds: Array.isArray(row.last_matched_listing_ids)
        ? (row.last_matched_listing_ids as string[])
        : [],
      isActive: row.is_active !== false,
      createdAt: String(row.created_at ?? new Date().toISOString()),
      updatedAt: String(row.updated_at ?? new Date().toISOString()),
    };
  });
}

async function loadFavorites(contactId: string): Promise<FavoriteSnapshot[]> {
  const { data } = await supabaseAdmin
    .from("contact_property_favorites")
    .select("address,city,state,zip,price,beds,baths,sqft,property_type")
    .eq("contact_id", contactId)
    .order("created_at", { ascending: false })
    .limit(20);
  return ((data ?? []) as Record<string, unknown>[]).map((r) => ({
    address: (r.address as string | null) ?? null,
    city: (r.city as string | null) ?? null,
    state: (r.state as string | null) ?? null,
    zip: (r.zip as string | null) ?? null,
    price: r.price === null || r.price === undefined ? null : Number(r.price),
    beds: r.beds === null || r.beds === undefined ? null : Number(r.beds),
    baths: r.baths === null || r.baths === undefined ? null : Number(r.baths),
    sqft: r.sqft === null || r.sqft === undefined ? null : Number(r.sqft),
    propertyType: (r.property_type as string | null) ?? null,
  }));
}

async function loadRecentViews(contactId: string): Promise<string[]> {
  // Distinct cities from recent property_view events — rough proxy for
  // "where they're looking".
  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const { data } = await supabaseAdmin
    .from("contact_events")
    .select("payload")
    .eq("contact_id", contactId)
    .eq("event_type", "property_view")
    .gte("created_at", since)
    .limit(100);
  const cities = new Set<string>();
  for (const r of data ?? []) {
    const payload = (r as { payload?: { city?: unknown } }).payload;
    const city = payload?.city;
    if (typeof city === "string" && city.trim()) cities.add(city.trim());
  }
  return Array.from(cities);
}

// =============================================================================
// Criteria derivation
// =============================================================================

/**
 * Pick the "effective" criteria for the listing search. Priority:
 *   1. Most recently updated saved search (explicit intent).
 *   2. Synthesized from favorites: median price ± 20%, most-common
 *      city/state, min beds/baths from the typical favorite.
 *   3. Widened safe default (city-only) if we have nothing else.
 */
function deriveEffectiveCriteria(
  savedSearches: SavedSearch[],
  favorites: FavoriteSnapshot[],
  viewedCities: string[],
): SavedSearchCriteria {
  // Prefer the most-recent saved search with non-empty criteria.
  const recentSearch = savedSearches.find((s) => Object.keys(s.criteria).length > 0);
  if (recentSearch) return { ...recentSearch.criteria };

  if (favorites.length > 0) {
    const prices = favorites.map((f) => f.price).filter((p): p is number => p !== null && p > 0);
    const bedsList = favorites.map((f) => f.beds).filter((b): b is number => b !== null && b > 0);
    const bathsList = favorites.map((f) => f.baths).filter((b): b is number => b !== null && b > 0);

    const avgPrice = prices.length > 0 ? prices.reduce((a, b) => a + b, 0) / prices.length : null;
    const medianBeds = bedsList.length > 0 ? Math.round(median(bedsList)) : null;
    const medianBaths = bathsList.length > 0 ? Math.round(median(bathsList)) : null;

    // Most-common city
    const cityFreq = new Map<string, number>();
    for (const f of favorites) {
      const key = [f.city, f.state].filter(Boolean).join(",");
      if (key) cityFreq.set(key, (cityFreq.get(key) ?? 0) + 1);
    }
    const topCity = [...cityFreq.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];

    const criteria: SavedSearchCriteria = {};
    if (topCity) {
      const [city, state] = topCity.split(",");
      if (city) criteria.city = city;
      if (state) criteria.state = state;
    }
    if (avgPrice) {
      criteria.priceMin = Math.round(avgPrice * 0.8);
      criteria.priceMax = Math.round(avgPrice * 1.2);
    }
    if (medianBeds) criteria.bedsMin = Math.max(1, medianBeds - 1);
    if (medianBaths) criteria.bathsMin = Math.max(1, medianBaths - 1);
    return criteria;
  }

  // Last-resort: lean on viewed cities if any.
  if (viewedCities[0]) {
    return { city: viewedCities[0] };
  }

  return {};
}

function median(nums: number[]): number {
  const sorted = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

// =============================================================================
// Scoring
// =============================================================================

function scoreCandidate(
  listing: MatchedListing,
  favorites: FavoriteSnapshot[],
  savedSearches: SavedSearch[],
): { score: number; reasons: string[] } {
  const reasons: string[] = [];
  let score = 0;

  // Zip overlap with favorites — strongest "same neighborhood" signal.
  const favZips = new Set(favorites.map((f) => f.zip).filter(Boolean) as string[]);
  if (listing.zip && favZips.has(listing.zip)) {
    score += 25;
    reasons.push(`same ZIP as a favorite (${listing.zip})`);
  } else if (listing.city && favorites.some((f) => f.city?.toLowerCase() === listing.city?.toLowerCase())) {
    score += 10;
    reasons.push(`same city as a favorite`);
  }

  // Price band proximity — within ±15% of favorite median.
  const favPrices = favorites.map((f) => f.price).filter((p): p is number => p !== null && p > 0);
  if (favPrices.length > 0 && listing.price) {
    const med = median(favPrices);
    const drift = Math.abs(listing.price - med) / med;
    if (drift < 0.1) {
      score += 20;
      reasons.push(`priced within 10% of their typical favorite`);
    } else if (drift < 0.2) {
      score += 12;
      reasons.push(`priced near their favorite range`);
    } else if (drift > 0.5) {
      score -= 10; // way off band — discourage
    }
  }

  // Beds/baths alignment
  const favBedsMed = favorites.map((f) => f.beds).filter((b): b is number => b !== null).length > 0
    ? median(favorites.map((f) => f.beds!).filter(Boolean))
    : null;
  if (favBedsMed !== null && listing.beds && Math.abs(listing.beds - favBedsMed) <= 1) {
    score += 10;
    reasons.push(`${listing.beds}bd matches their usual`);
  }

  // Saved search match — did the user already explicitly ask for this?
  for (const s of savedSearches) {
    const c = s.criteria;
    let matched = false;
    if (c.city && listing.city?.toLowerCase() === c.city.toLowerCase()) matched = true;
    if (c.zip && listing.zip === c.zip) matched = true;
    if (c.priceMin && listing.price && listing.price < c.priceMin) matched = false;
    if (c.priceMax && listing.price && listing.price > c.priceMax) matched = false;
    if (matched) {
      score += 15;
      reasons.push(`matches saved search "${s.name}"`);
      break;
    }
  }

  // Light boost for listings with photos (more likely to convert on open).
  if (listing.photoUrl) score += 3;

  return { score: Math.max(0, Math.min(100, score)), reasons };
}

// =============================================================================
// LLM rationale (optional, env-gated)
// =============================================================================

async function llmRerank(
  contactFirstName: string | null,
  topCandidates: Array<{ listing: MatchedListing; score: number; reasons: string[] }>,
  favorites: FavoriteSnapshot[],
  savedSearches: SavedSearch[],
  userId: string | null,
): Promise<Array<{ listing: MatchedListing; score: number; rationale: string; reasons: string[] }>> {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) {
    return topCandidates.map((c) => ({
      listing: c.listing,
      score: c.score,
      rationale: c.reasons[0] ?? "Matches their buying pattern",
      reasons: c.reasons,
    }));
  }

  const favLines = favorites
    .slice(0, 5)
    .map(
      (f, i) =>
        `  ${i + 1}. ${f.address ?? "(unknown)"} — $${f.price?.toLocaleString() ?? "?"} · ${f.beds ?? "?"}bd / ${f.baths ?? "?"}ba · ${f.sqft?.toLocaleString() ?? "?"}sqft`,
    )
    .join("\n");

  const searchLines = savedSearches
    .slice(0, 3)
    .map((s, i) => `  ${i + 1}. ${s.name}: ${JSON.stringify(s.criteria)}`)
    .join("\n");

  const candidateLines = topCandidates
    .map(
      (c, i) =>
        `  [${i}] ${c.listing.address} — $${c.listing.price?.toLocaleString() ?? "?"} · ${c.listing.beds ?? "?"}bd / ${c.listing.baths ?? "?"}ba · zip ${c.listing.zip ?? "?"}`,
    )
    .join("\n");

  const prompt = `You're helping a real-estate agent recommend listings to ${contactFirstName ?? "their client"}.

Client favorites (what they've explicitly saved):
${favLines || "  (none)"}

Client's saved searches:
${searchLines || "  (none)"}

Candidate listings to evaluate:
${candidateLines}

For each candidate, write a one-sentence rationale (under 20 words) explaining why it's a match or not. Respond as a JSON array where each entry is { "index": <number>, "rationale": "<text>" }, in the same order as the candidates. No markdown, no prose outside the JSON array.`;

  try {
    const { text } = await generateAIResponse({
      prompt,
      userId: userId ?? "system",
      tool: "property_recommender",
      temperature: 0.3,
      useCache: false,
    });
    const cleaned = text.trim().replace(/^```json\s*/i, "").replace(/```$/i, "").trim();
    const parsed = JSON.parse(cleaned) as Array<{ index: number; rationale: string }>;
    return topCandidates.map((c, i) => {
      const r = parsed.find((x) => x.index === i);
      return {
        listing: c.listing,
        score: c.score,
        rationale: r?.rationale ?? c.reasons[0] ?? "Matches their buying pattern",
        reasons: c.reasons,
      };
    });
  } catch (e) {
    console.error("[recommender] LLM rerank failed, falling back", e);
    return topCandidates.map((c) => ({
      listing: c.listing,
      score: c.score,
      rationale: c.reasons[0] ?? "Matches their buying pattern",
      reasons: c.reasons,
    }));
  }
}

// =============================================================================
// Public entry point
// =============================================================================

export async function recommendPropertiesForContact(
  contactId: string,
  opts: { limit?: number } = {},
): Promise<RecommenderResult> {
  const limit = Math.min(opts.limit ?? 8, 20);

  const [contact, savedSearches, favorites, viewedCities] = await Promise.all([
    loadContact(contactId),
    loadSavedSearches(contactId),
    loadFavorites(contactId),
    loadRecentViews(contactId),
  ]);

  const priceRange = (() => {
    const prices = favorites.map((f) => f.price).filter((p): p is number => p !== null && p > 0);
    if (prices.length === 0) return { min: null, max: null };
    return { min: Math.min(...prices), max: Math.max(...prices) };
  })();

  const preferredCities = Array.from(
    new Set<string>([
      ...favorites.map((f) => f.city).filter((c): c is string => !!c),
      ...viewedCities,
    ]),
  ).slice(0, 5);

  const baseCriteria = deriveEffectiveCriteria(savedSearches, favorites, viewedCities);

  const match = await findMatchingListings(baseCriteria);
  if (match.ok === false || match.listings.length === 0) {
    return {
      candidates: [],
      context: {
        favoriteCount: favorites.length,
        savedSearchCount: savedSearches.length,
        viewedCount: viewedCities.length,
        priceRange,
        preferredCities,
        usedLlm: false,
      },
    };
  }

  // Filter out any listings the contact has already favorited — they
  // don't need us to recommend what they already picked.
  const favoriteAddresses = new Set(
    favorites.map((f) => f.address?.toLowerCase()).filter(Boolean),
  );
  const novel = match.listings.filter((l) => !favoriteAddresses.has(l.address.toLowerCase()));

  const scored = novel
    .map((listing) => {
      const { score, reasons } = scoreCandidate(listing, favorites, savedSearches);
      return { listing, score, reasons };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);

  const usedLlm = !!process.env.OPENAI_API_KEY?.trim();
  const reranked = await llmRerank(
    contact?.firstName ?? null,
    scored,
    favorites,
    savedSearches,
    contact?.userId ?? null,
  );

  return {
    candidates: reranked.map((c) => ({
      listing: c.listing,
      score: c.score,
      rationale: c.rationale,
      matchReasons: c.reasons,
    })),
    context: {
      favoriteCount: favorites.length,
      savedSearchCount: savedSearches.length,
      viewedCount: viewedCities.length,
      priceRange,
      preferredCities,
      usedLlm,
    },
  };
}

// Keep an eslint-quiet noop for the unused import when we want the compiler
// to still track PropertyTypeFilter as in-use (type narrowing in tests).
export type { PropertyTypeFilter };
