import "server-only";

import { getAnthropicClient, isAnthropicConfigured } from "@/lib/anthropic";

/**
 * AI offer builder — recommends a competitive, sound BUYER offer (terms +
 * rationale + a buyer cover letter) for a target property. Grounds price on the
 * list price, an optional CMA value the agent provides, market heat, and the
 * level of competition. It recommends strategy; the agent reviews and saves.
 * Not legal/financial advice.
 */

export type BuildOfferInput = {
  address: string;
  listPrice: number;
  /** Optional CMA / estimated value for grounding (agent pastes from their CMA). */
  estimatedValue?: number | null;
  buyerMaxBudget?: number | null;
  financingType?: string | null; // cash | conventional | fha | va | jumbo
  /** Free text: buyer motivation / how badly they want it. */
  motivation?: string | null;
  marketHeat?: "hot" | "balanced" | "cool" | null;
  competingOffers?: number | null;
};

export type BuiltOffer = {
  strategy: "aggressive" | "market" | "conservative";
  offerPrice: number;
  earnestMoney: number | null;
  downPayment: number | null;
  financingType: string | null;
  escalationCap: number | null;
  closeDays: number | null;
  contingencies: {
    inspection: "keep" | "waive";
    appraisal: "keep" | "waive";
    loan: "keep" | "waive";
  };
  rationale: string;
  coverLetter: string;
  disclaimer: string;
};

const MODEL = "claude-sonnet-4-6";

const DISCLAIMER =
  "AI-suggested terms to support your strategy — not legal or financial advice. Confirm price, contingencies, and dates with your buyer and broker before submitting.";

const SYSTEM_PROMPT = `You are an experienced buyer's real estate agent crafting a competitive but sound offer for your client. Recommend offer terms that balance winning the deal against overpaying or taking on undue risk.

Principles:
- Price: anchor on the property's value (use the estimated/CMA value when given; otherwise the list price). In a hot market with competition, go at or above list/value; in a cool market, leave room. Never exceed the buyer's max budget when one is given.
- Contingencies: keeping them protects the buyer; waiving wins offers but adds risk. Only recommend WAIVING a contingency when the market is hot / there is real competition AND it's reasonable for this buyer (e.g. waive appraisal only if they can cover a gap; waive inspection only with strong conviction). Default to keeping in balanced/cool markets.
- Earnest money: typically ~1-3% of offer price (higher signals seriousness in competition).
- Escalation: when there are competing offers, suggest an escalation cap (the max the buyer will auto-escalate to), not above their budget.
- Close timeline: cash/strong-financing can close faster; suggest a reasonable number of days.

Respond with EXACTLY ONE fenced JSON code block and nothing else:

\`\`\`json
{
  "strategy": "aggressive" | "market" | "conservative",
  "offerPrice": 0,
  "earnestMoney": 0,
  "downPayment": 0,
  "financingType": "cash|conventional|fha|va|jumbo|null",
  "escalationCap": 0,
  "closeDays": 0,
  "contingencies": { "inspection": "keep|waive", "appraisal": "keep|waive", "loan": "keep|waive" },
  "rationale": "3-5 sentences: the price logic vs value/list, the contingency strategy, and how this wins without overpaying",
  "coverLetter": "a short, warm 1-paragraph letter from the buyer to the seller (no fair-housing-sensitive personal details)",
  "disclaimer": ""
}
\`\`\`

Numbers only (no $ or commas). Use null for escalationCap when there's no competition. Never recommend above the buyer's stated max budget.`;

export async function buildOfferRecommendation(input: BuildOfferInput): Promise<BuiltOffer> {
  if (!isAnthropicConfigured()) {
    throw new Error("AI offer builder is unavailable — ANTHROPIC_API_KEY is not configured.");
  }
  if (!input.address.trim()) throw new Error("Property address is required.");
  if (!(input.listPrice > 0)) throw new Error("A valid list price is required.");

  const client = getAnthropicClient();

  const facts: (string | null)[] = [
    `Property: ${input.address.trim()}`,
    `List price: $${Math.round(input.listPrice).toLocaleString()}`,
    input.estimatedValue ? `Estimated/CMA value: $${Math.round(input.estimatedValue).toLocaleString()}` : null,
    input.buyerMaxBudget ? `Buyer max budget: $${Math.round(input.buyerMaxBudget).toLocaleString()}` : null,
    input.financingType ? `Buyer financing: ${input.financingType}` : null,
    input.marketHeat ? `Market: ${input.marketHeat}` : null,
    input.competingOffers != null ? `Competing offers: ${input.competingOffers}` : null,
    input.motivation ? `Buyer notes: ${input.motivation}` : null,
  ];
  const userPrompt = `${facts.filter(Boolean).join("\n")}\n\nRecommend the offer and return the JSON.`;

  let text = "";
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const res: any = await client.messages.create({
    model: MODEL,
    max_tokens: 1500,
    system: SYSTEM_PROMPT,
    messages: [{ role: "user", content: userPrompt }],
  });
  for (const b of Array.isArray(res?.content) ? res.content : []) {
    const block = b as { type?: string; text?: string };
    if (block.type === "text" && typeof block.text === "string") text += block.text;
  }

  const parsed = extractJson(text);
  if (!parsed) throw new Error("Could not parse the AI offer.");

  const c = (parsed.contingencies ?? {}) as Record<string, unknown>;
  const keepWaive = (v: unknown): "keep" | "waive" => (v === "waive" ? "waive" : "keep");
  const strat = parsed.strategy;
  return {
    strategy: strat === "aggressive" || strat === "conservative" ? strat : "market",
    offerPrice: num(parsed.offerPrice) ?? Math.round(input.listPrice),
    earnestMoney: num(parsed.earnestMoney),
    downPayment: num(parsed.downPayment),
    financingType:
      typeof parsed.financingType === "string" && parsed.financingType !== "null"
        ? parsed.financingType
        : input.financingType ?? null,
    escalationCap: num(parsed.escalationCap),
    closeDays: num(parsed.closeDays),
    contingencies: {
      inspection: keepWaive(c.inspection),
      appraisal: keepWaive(c.appraisal),
      loan: keepWaive(c.loan),
    },
    rationale: String(parsed.rationale ?? ""),
    coverLetter: String(parsed.coverLetter ?? ""),
    disclaimer: DISCLAIMER,
  };
}

function num(v: unknown): number | null {
  const n = typeof v === "number" ? v : typeof v === "string" ? Number(String(v).replace(/[$,]/g, "")) : NaN;
  return Number.isFinite(n) && n > 0 ? Math.round(n) : null;
}

function extractJson(text: string): Record<string, unknown> | null {
  const fenced = text.match(/```json\s*([\s\S]*?)```/i);
  let candidate = fenced ? fenced[1] : null;
  if (!candidate) {
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
    candidate = start >= 0 && end > start ? text.slice(start, end + 1) : null;
  }
  if (!candidate) return null;
  try {
    const obj = JSON.parse(candidate);
    return obj && typeof obj === "object" ? (obj as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}
