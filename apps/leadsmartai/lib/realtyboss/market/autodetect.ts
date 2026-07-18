import "server-only";

import { getAnthropicClient, isAnthropicConfigured } from "@/lib/anthropic";
import { supabaseAdmin } from "@/lib/supabase/admin";
import {
  isValidServiceArea,
  parseServiceAreas,
  serviceAreasToLegacyStrings,
  type AgentServiceArea,
} from "@/lib/geo/serviceArea";

/**
 * AI-assisted default-market detection — reduces onboarding friction by turning
 * the request's IP geolocation into a proper, county-wide service area the agent
 * just confirms (or edits later, any time).
 *
 * The "AI" step: IP geo gives city + state, but the service-area model needs the
 * COUNTY. Claude reliably maps a US city+state to its county. US-only.
 */

export type GeoHint = { city: string | null; region: string | null; country: string | null };

/** Read Vercel's IP-geolocation headers off a request. */
export function readGeoFromHeaders(h: Headers): GeoHint {
  const dec = (v: string | null) => {
    if (!v) return null;
    try {
      return decodeURIComponent(v).trim() || null;
    } catch {
      return v.trim() || null;
    }
  };
  return {
    city: dec(h.get("x-vercel-ip-city")),
    region: dec(h.get("x-vercel-ip-country-region")), // 2-letter US state code
    country: dec(h.get("x-vercel-ip-country")),
  };
}

/** Map an IP geo hint to a county-wide default service area (US only). Null if we can't. */
export async function detectServiceAreaFromGeo(geo: GeoHint): Promise<AgentServiceArea | null> {
  if (geo.country && geo.country.toUpperCase() !== "US") return null;
  const state = (geo.region ?? "").toUpperCase().trim();
  const city = (geo.city ?? "").trim();
  if (state.length !== 2 || !city) return null;
  if (!isAnthropicConfigured()) return null;

  try {
    const client = getAnthropicClient();
    const res = await client.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 200,
      system:
        "You map a US city + state to its county. Return ONLY a JSON object " +
        '{ "state": "<2-letter USPS>", "county": "<county name without the word County>" }. ' +
        "If the city/state is not a real US location, return {}.",
      messages: [{ role: "user", content: `City: ${city}\nState: ${state}\n\nWhat county?` }],
    });
    const tb = res.content.find((b) => b.type === "text");
    const text = tb && tb.type === "text" ? tb.text : "";
    const m = text.match(/\{[\s\S]*\}/);
    if (!m) return null;
    const parsed = JSON.parse(m[0]) as { state?: unknown; county?: unknown };
    const county = typeof parsed.county === "string" ? parsed.county.replace(/\s+County$/i, "").trim() : "";
    const st = typeof parsed.state === "string" ? parsed.state.toUpperCase().trim() : state;
    // County-wide default (city: null) — broad, sensible default the agent narrows later.
    const area: AgentServiceArea = { state: st.slice(0, 2), county, city: null };
    return isValidServiceArea(area) ? area : null;
  } catch {
    return null;
  }
}

/**
 * If the agent has NO service area yet, auto-detect one from the geo hint and
 * assign it as their default (dual-write v2 + legacy). Best-effort — never
 * throws; returns whatever service areas the agent now has.
 */
export async function ensureAgentDefaultMarket(agentId: string, geo: GeoHint): Promise<AgentServiceArea[]> {
  try {
    const { data } = await supabaseAdmin
      .from("agents")
      .select("service_areas_v2")
      .eq("id", agentId)
      .maybeSingle();
    const existing = parseServiceAreas((data as { service_areas_v2?: unknown } | null)?.service_areas_v2);
    if (existing.length > 0) return existing;

    const area = await detectServiceAreaFromGeo(geo);
    if (!area) return [];
    const areas = [area];
    await supabaseAdmin
      .from("agents")
      .update({ service_areas_v2: areas, service_areas: serviceAreasToLegacyStrings(areas) })
      .eq("id", agentId);
    return areas;
  } catch {
    return [];
  }
}
