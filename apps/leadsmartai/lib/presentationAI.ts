import "server-only";

import { getAnthropicClient, isAnthropicConfigured } from "@/lib/anthropic";

export type PresentationAISections = {
  pricing_strategy: string;
  market_insights: string;
  marketing_plan: string;
};

const MODEL = "claude-opus-4-8";

function extractJsonObject(text: string): any {
  const trimmed = text.trim();
  if (trimmed.startsWith("{") && trimmed.endsWith("}")) {
    return JSON.parse(trimmed);
  }

  const firstBrace = trimmed.indexOf("{");
  const lastBrace = trimmed.lastIndexOf("}");
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    const slice = trimmed.slice(firstBrace, lastBrace + 1);
    return JSON.parse(slice);
  }

  throw new Error("AI output did not contain a JSON object.");
}

export async function generatePresentationAISections(params: {
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
}): Promise<PresentationAISections> {
  const fallback: PresentationAISections = {
    pricing_strategy:
      "Suggested approach: price competitively within the estimated range and use recent comp momentum to support your final list price. Consider offering strong initial terms (e.g., quick-close incentives) to attract qualified showings.",
    market_insights:
      params.estimate.summary ||
      "Based on nearby comparable sold properties, your home’s estimated value is supported by current market conditions and pricing patterns in the area.",
    marketing_plan:
      "Marketing plan: optimize listing photos for the buyer journey, write a compelling headline focused on buyer benefits, schedule targeted social + local search ads, and use a weekly open house + follow-up cadence to build momentum.",
  };

  if (!isAnthropicConfigured()) return fallback;

  // Avoid raw MLS/warehouse details; include only what’s needed for strategy.
  const compsForPrompt = params.comps
    .slice(0, 8)
    .map((c, idx) => ({
      rank: idx + 1,
      address: c.address,
      sold_price: c.price,
      sold_date: c.soldDate,
      sqft: c.sqft,
      distance_miles: c.distanceMiles,
    }));

  const prompt = `Create three sections for a homeowner listing presentation based on the property address, the point estimate/range, and a short list of nearby sold comps.

Return ONLY valid JSON with this exact schema:
{
  "pricing_strategy": string,
  "market_insights": string,
  "marketing_plan": string
}

Rules:
- Do not include any raw MLS identifiers.
- Keep content specific to the neighborhood pattern implied by the comps.
- Use concise but persuasive language suitable for a seller.
- Marketing plan should include timing + channels + next steps.

Address: ${params.address}

Estimate:
- estimatedValue: ${params.estimate.estimatedValue}
- low: ${params.estimate.low}
- high: ${params.estimate.high}
- summary: ${params.estimate.summary}

Nearby sold comps (JSON):
${JSON.stringify(compsForPrompt, null, 2)}
`;

  try {
    const client = getAnthropicClient();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const res: any = await client.messages.create({
      model: MODEL,
      max_tokens: 1500,
      system:
        "You are a professional real estate listing strategist. Return ONLY a JSON object with keys pricing_strategy, market_insights, marketing_plan. No markdown, no extra keys.",
      messages: [{ role: "user", content: prompt }],
    });

    const content: unknown[] = Array.isArray(res?.content) ? res.content : [];
    const text = content
      .map((b) => (b as { type?: string; text?: string }))
      .filter((b) => b.type === "text" && typeof b.text === "string")
      .map((b) => b.text as string)
      .join("");
    if (!text) return fallback;

    const parsed = extractJsonObject(text);
    return {
      pricing_strategy: String(parsed?.pricing_strategy ?? fallback.pricing_strategy),
      market_insights: String(parsed?.market_insights ?? fallback.market_insights),
      marketing_plan: String(parsed?.marketing_plan ?? fallback.marketing_plan),
    };
  } catch (e) {
    console.error("presentation AI (Claude) failed", e);
    return fallback;
  }
}

