import "server-only";

import { getAnthropicClient, isAnthropicConfigured } from "@/lib/anthropic";
import { cachedSystem, markTranscriptCached } from "@leadsmart/shared/utils/promptCache";
import type { PresentationSchool } from "@/lib/presentationAI";
import type { PropertyUse } from "./types";

/**
 * AI piece of the Property Deep Report — Claude + live web search produces a
 * deal rating, a rent estimate (for investment use), neighborhood highlights,
 * and nearby schools. Grounded on real data (rental comps, school ratings);
 * never fabricated. Same web_search + pause_turn pattern as lib/cma/aiCma.
 */

const MODEL = "claude-opus-4-8";
const MAX_TOOL_ROUNDS = 8;

type WebTool = { type: string; name: string; max_uses?: number };

export type DeepReportAi = {
  dealRating: { grade: string; score: number | null; rationale: string };
  /** Monthly market rent estimate (investment use); null otherwise/unknown. */
  rentEstimateMonthly: number | null;
  rentSummary: string | null;
  /** Monthly Mello-Roos / special assessment if the property is in a CA CFD; 0 when none/not applicable. */
  melloRoosMonthly: number | null;
  neighborhood: string;
  schools: PresentationSchool[];
  sources: { title: string; url: string }[];
};

export async function generateDeepReportAi(input: {
  address: string;
  propertyUse: PropertyUse;
  estimate: { estimatedValue: number | null; low: number | null; high: number | null; avgPricePerSqft: number | null };
  comps: Array<{ address: string; price: number | null; sqft: number | null; soldDate: string }>;
}): Promise<DeepReportAi> {
  const fallback: DeepReportAi = {
    dealRating: {
      grade: "—",
      score: null,
      rationale:
        "Not enough verified data to rate this deal. Review the comps and pricing with your agent.",
    },
    rentEstimateMonthly: null,
    rentSummary: null,
    melloRoosMonthly: null,
    neighborhood: "",
    schools: [],
    sources: [],
  };
  if (!isAnthropicConfigured()) return fallback;

  const investment = input.propertyUse === "investment";
  const compsForPrompt = input.comps.slice(0, 8).map((c, i) => ({
    rank: i + 1,
    address: c.address,
    sold_price: c.price,
    sold_date: c.soldDate,
    sqft: c.sqft,
  }));

  const system = `You are a buyer's-agent analyst preparing a property "deep report". Use web_search to ground neighborhood, schools${investment ? ", and current market RENT" : ""} in REAL data — never invent school names, ratings, rents, or amenities.

Produce:
- dealRating: grade A–F + score 0-100 + 2-3 sentence rationale, judging the estimated price vs the comps and local market (is it under/over-priced, condition + price considerations). Be honest.
- neighborhood: 2-4 sentences (walkability, amenities, commute, lifestyle).
- melloRoosMonthly: if this property is in a California Mello-Roos / Community Facilities District (CFD) with a special assessment, the approximate MONTHLY amount in dollars; use 0 when it is not in a CFD or none applies. Most established neighborhoods have none — only newer developments typically do. Do not guess a nonzero number.
- schools: nearest assigned/notable schools with level + rating + distance ([] if none verifiable).
${investment ? "- rentEstimateMonthly: a realistic monthly market rent (number) from comparable rentals you find; rentSummary: 1-2 sentences on the rental comps. Use null if you cannot find rental data." : "- rentEstimateMonthly: null; rentSummary: null (not an investment analysis)."}

When done searching, respond with EXACTLY ONE fenced JSON block and nothing after:

\`\`\`json
{
  "dealRating": { "grade": "B", "score": 78, "rationale": "" },
  "rentEstimateMonthly": null,
  "rentSummary": null,
  "melloRoosMonthly": 0,
  "neighborhood": "",
  "schools": [ { "name": "", "level": "Elementary|Middle|High", "rating": "8/10", "distance": "0.4 mi" } ],
  "sources": [ { "title": "", "url": "" } ]
}
\`\`\``;

  const userPrompt =
    `Property: ${input.address}\nIntended use: ${input.propertyUse}\n` +
    `Estimated value ${input.estimate.estimatedValue}, range ${input.estimate.low}–${input.estimate.high}, ~$${input.estimate.avgPricePerSqft}/sqft.\n\n` +
    `Comps (JSON):\n${JSON.stringify(compsForPrompt, null, 2)}\n\n` +
    `Search the web (neighborhood, schools${investment ? ", rental comps" : ""}), then return the JSON.`;

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
        // Cached. This one matters most: Opus, six searches, up to eight
        // rounds — every round re-sent the lot at full price.
        system: cachedSystem(system) as never,
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
        markTranscriptCached(messages as never);
        continue;
      }
      break;
    }
  } catch (e) {
    console.error("deep report AI failed", e);
    return fallback;
  }

  if (!sawText) return fallback;
  const parsed = extractJson(finalText);
  if (!parsed) return fallback;

  const dr = (parsed.dealRating ?? {}) as Record<string, unknown>;
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
    dealRating: {
      grade: dr.grade == null ? "—" : String(dr.grade),
      score: numOrNull(dr.score),
      rationale: dr.rationale == null ? fallback.dealRating.rationale : String(dr.rationale),
    },
    rentEstimateMonthly: numOrNull(parsed.rentEstimateMonthly),
    rentSummary: parsed.rentSummary == null ? null : String(parsed.rentSummary),
    melloRoosMonthly: numOrNull(parsed.melloRoosMonthly),
    neighborhood: parsed.neighborhood == null ? "" : String(parsed.neighborhood),
    schools,
    sources,
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function extractJson(text: string): Record<string, any> | null {
  const fenced = text.match(/```json\s*([\s\S]*?)```/i);
  let candidate: string | null = null;
  if (fenced) {
    candidate = fenced[1];
  } else {
    const s = text.indexOf("{");
    const e = text.lastIndexOf("}");
    candidate = s >= 0 && e > s ? text.slice(s, e + 1) : null;
  }
  if (!candidate) return null;
  try {
    const obj = JSON.parse(candidate);
    return obj && typeof obj === "object" ? obj : null;
  } catch {
    return null;
  }
}

function numOrNull(v: unknown): number | null {
  if (v == null) return null;
  const n = typeof v === "number" ? v : Number(String(v).replace(/[$,/mo]/gi, ""));
  return Number.isFinite(n) ? n : null;
}
