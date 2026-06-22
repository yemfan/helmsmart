import "server-only";

import { getAnthropicClient, isAnthropicConfigured } from "@/lib/anthropic";

export type PresentationSchool = {
  name: string;
  /** Elementary / Middle / High (free text). */
  level: string | null;
  /** e.g. "8/10" (GreatSchools) — kept as text to fit varied sources. */
  rating: string | null;
  /** e.g. "0.4 mi". */
  distance: string | null;
};

export type PresentationAISections = {
  pricing_strategy: string;
  market_insights: string;
  marketing_plan: string;
  /** Short neighborhood / amenities / commute highlights. */
  neighborhood: string;
  /** Nearby schools (web-search grounded). */
  schools: PresentationSchool[];
  /** Cited sources backing the schools / neighborhood facts. */
  sources: { title: string; url: string }[];
};

const MODEL = "claude-opus-4-8";
const MAX_TOOL_ROUNDS = 8;

export type PresentationAIInput = {
  address: string;
  estimate: {
    estimatedValue: number | null;
    low: number | null;
    high: number | null;
    avgPricePerSqft: number | null;
    summary: string;
  };
  comps: Array<{
    address: string;
    price: number | null;
    sqft: number | null;
    soldDate: string;
    distanceMiles: number | null;
  }>;
};

type WebTool = { type: string; name: string; max_uses?: number };

const SYSTEM_PROMPT = `You are a professional real-estate listing strategist preparing a seller's listing presentation. Use the web_search tool to ground neighborhood + school facts in REAL, current data — never invent school names, ratings, or amenities.

Produce four narrative sections plus structured school data, specific to the property's actual neighborhood (inferred from the address + comps):
- pricing_strategy: how to price within the estimate range using comp momentum; concise + persuasive for a seller.
- market_insights: local market conditions / recent trends supported by the comps.
- marketing_plan: concrete plan with timing + channels + next steps.
- neighborhood: 2-4 sentences on the neighborhood — walkability, amenities, commute, lifestyle — grounded in what you find.
- schools: the nearest assigned/notable public schools you can verify via search, each with level + rating + distance. Use [] if you can't verify any; never fabricate.

Do not include raw MLS identifiers. When done searching, respond with EXACTLY ONE fenced JSON code block and nothing after it:

\`\`\`json
{
  "pricing_strategy": "",
  "market_insights": "",
  "marketing_plan": "",
  "neighborhood": "",
  "schools": [ { "name": "", "level": "Elementary|Middle|High", "rating": "8/10", "distance": "0.4 mi" } ],
  "sources": [ { "title": "", "url": "" } ]
}
\`\`\``;

export async function generatePresentationAISections(
  params: PresentationAIInput,
): Promise<PresentationAISections> {
  const fallback: PresentationAISections = {
    pricing_strategy:
      "Suggested approach: price competitively within the estimated range and use recent comp momentum to support your final list price. Consider offering strong initial terms (e.g., quick-close incentives) to attract qualified showings.",
    market_insights:
      params.estimate.summary ||
      "Based on nearby comparable sold properties, your home's estimated value is supported by current market conditions and pricing patterns in the area.",
    marketing_plan:
      "Marketing plan: optimize listing photos for the buyer journey, write a compelling headline focused on buyer benefits, schedule targeted social + local search ads, and use a weekly open house + follow-up cadence to build momentum.",
    neighborhood: "",
    schools: [],
    sources: [],
  };

  if (!isAnthropicConfigured()) return fallback;

  const compsForPrompt = params.comps.slice(0, 8).map((c, idx) => ({
    rank: idx + 1,
    address: c.address,
    sold_price: c.price,
    sold_date: c.soldDate,
    sqft: c.sqft,
    distance_miles: c.distanceMiles,
  }));

  const userPrompt =
    `Property address: ${params.address}\n\n` +
    `Estimate: value ${params.estimate.estimatedValue}, range ${params.estimate.low}–${params.estimate.high}.\n` +
    (params.estimate.summary ? `Summary: ${params.estimate.summary}\n` : "") +
    `\nNearby sold comps (JSON):\n${JSON.stringify(compsForPrompt, null, 2)}\n\n` +
    `Search the web for the neighborhood + nearest schools, then return the JSON.`;

  const tools = [{ type: "web_search_20250305", name: "web_search", max_uses: 6 } as WebTool];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const messages: any[] = [{ role: "user", content: userPrompt }];

  let finalText = "";
  let sawText = false;
  try {
    const client = getAnthropicClient();
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
    console.error("presentation AI (Claude) failed", e);
    return fallback;
  }

  if (!sawText) return fallback;
  const parsed = extractJsonObject(finalText);
  if (!parsed) return fallback;

  const rawSchools = Array.isArray(parsed.schools) ? parsed.schools : [];
  const schools: PresentationSchool[] = rawSchools
    .map((s: unknown) => {
      const o = (s ?? {}) as Record<string, unknown>;
      const name = typeof o.name === "string" ? o.name.trim() : "";
      if (!name) return null;
      return {
        name,
        level: o.level == null ? null : String(o.level),
        rating: o.rating == null ? null : String(o.rating),
        distance: o.distance == null ? null : String(o.distance),
      };
    })
    .filter((s: PresentationSchool | null): s is PresentationSchool => s !== null);

  const rawSources = Array.isArray(parsed.sources) ? parsed.sources : [];
  const sources = rawSources
    .map((s: unknown) => {
      const o = (s ?? {}) as Record<string, unknown>;
      const url = typeof o.url === "string" ? o.url.trim() : "";
      return url ? { title: typeof o.title === "string" && o.title.trim() ? o.title.trim() : url, url } : null;
    })
    .filter((s: { title: string; url: string } | null): s is { title: string; url: string } => s !== null);

  return {
    pricing_strategy: String(parsed.pricing_strategy ?? fallback.pricing_strategy),
    market_insights: String(parsed.market_insights ?? fallback.market_insights),
    marketing_plan: String(parsed.marketing_plan ?? fallback.marketing_plan),
    neighborhood: String(parsed.neighborhood ?? ""),
    schools,
    sources,
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function extractJsonObject(text: string): Record<string, any> | null {
  const fenced = text.match(/```json\s*([\s\S]*?)```/i);
  const candidate = fenced ? fenced[1] : sliceFirstObject(text);
  if (!candidate) return null;
  try {
    const obj = JSON.parse(candidate);
    return obj && typeof obj === "object" ? obj : null;
  } catch {
    return null;
  }
}

function sliceFirstObject(text: string): string | null {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  return start >= 0 && end > start ? text.slice(start, end + 1) : null;
}
