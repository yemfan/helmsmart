import "server-only";

import { getAnthropicClient, isAnthropicConfigured } from "@/lib/anthropic";

/**
 * AI summary + recommendation over a listing's competing offers. The
 * deterministic comparison (net-to-seller, ranking) already lives in
 * netToSeller.ts + the compare client; this layer reads those numbers and
 * explains them in plain English: which offer is strongest and why, what to
 * watch, and a seller-ready note. It only summarizes the facts passed in — it
 * never invents terms, and it is explicitly not legal/financial advice.
 */

export type OfferForSummary = {
  id: string;
  buyerName: string | null;
  price: number;
  /** Net to seller, already computed with the agent's tuned assumptions. */
  net: number;
  financing: string | null;
  isCash: boolean;
  contingencyCount: number;
  sellerConcessions: number | null;
  closeDate: string | null;
  status: string;
};

export type OfferCompareSummary = {
  recommendation: {
    topOfferId: string | null;
    headline: string;
    rationale: string;
    watchOuts: string[];
  };
  perOffer: { offerId: string; summary: string }[];
  sellerNote: string;
  disclaimer: string;
};

const MODEL = "claude-sonnet-4-6";

const DISCLAIMER =
  "AI summary to support your judgment — not legal or financial advice. Verify each offer's terms and the net figures before advising the seller.";

const SYSTEM_PROMPT = `You are an experienced listing agent's analyst helping compare competing offers on a home. You are given each offer's key facts, including the NET TO SELLER (the seller's actual proceeds after commission, title/escrow, transfer tax, and the concessions THAT offer asks for). Net to seller — not sticker price — is what the seller actually receives.

Weigh the whole picture: net to seller (primary), then certainty of close (fewer contingencies and cash / strong financing are cleaner and lower-risk), then timeline (close date) and any concessions. The highest price is NOT always the best offer; say so when a lower-priced offer nets more or closes cleaner.

Respond with EXACTLY ONE fenced JSON code block and nothing else, matching:

\`\`\`json
{
  "recommendation": {
    "topOfferId": "<id of the offer you would recommend, or null if too close/insufficient>",
    "headline": "one sentence naming the recommended offer and the single biggest reason",
    "rationale": "2-4 sentences comparing the top contenders on net, certainty, and timeline",
    "watchOuts": ["a short caution or counter-suggestion", "..."]
  },
  "perOffer": [ { "offerId": "<id>", "summary": "one tight sentence on this offer's strengths + weaknesses" } ],
  "sellerNote": "2-3 plain-English sentences the agent can forward to the seller — no jargon",
  "disclaimer": ""
}
\`\`\`

Be concise and concrete. Use the numbers provided. Never invent terms that weren't given.`;

export async function summarizeOffers(input: {
  listPrice: number | null;
  offers: OfferForSummary[];
}): Promise<OfferCompareSummary> {
  if (!isAnthropicConfigured()) {
    throw new Error("AI summary is unavailable — ANTHROPIC_API_KEY is not configured.");
  }
  if (!input.offers.length) throw new Error("No offers to summarize.");

  const client = getAnthropicClient();

  const lines = input.offers.map((o, i) => {
    const parts: (string | null)[] = [
      `id=${o.id}`,
      `buyer=${o.buyerName || `Offer ${i + 1}`}`,
      `price=$${Math.round(o.price).toLocaleString()}`,
      `netToSeller=$${Math.round(o.net).toLocaleString()}`,
      `financing=${o.isCash ? "cash" : o.financing || "unknown"}`,
      `openContingencies=${o.contingencyCount}`,
      o.sellerConcessions ? `sellerConcessions=$${Math.round(o.sellerConcessions).toLocaleString()}` : null,
      o.closeDate ? `proposedClose=${o.closeDate}` : null,
      `status=${o.status}`,
    ];
    return `- ${parts.filter(Boolean).join(", ")}`;
  });

  const userPrompt =
    `List price: ${input.listPrice ? `$${Math.round(input.listPrice).toLocaleString()}` : "unknown"}\n\n` +
    `Offers (${input.offers.length}):\n${lines.join("\n")}\n\nCompare them and return the JSON.`;

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
  if (!parsed) throw new Error("Could not parse the AI summary.");

  const rec = (parsed.recommendation ?? {}) as Record<string, unknown>;
  const per = Array.isArray(parsed.perOffer) ? parsed.perOffer : [];
  return {
    recommendation: {
      topOfferId: typeof rec.topOfferId === "string" ? rec.topOfferId : null,
      headline: String(rec.headline ?? ""),
      rationale: String(rec.rationale ?? ""),
      watchOuts: Array.isArray(rec.watchOuts) ? rec.watchOuts.map(String).slice(0, 5) : [],
    },
    perOffer: per
      .map((p) => {
        const o = (p ?? {}) as Record<string, unknown>;
        return { offerId: String(o.offerId ?? ""), summary: String(o.summary ?? "") };
      })
      .filter((p) => p.offerId),
    sellerNote: String(parsed.sellerNote ?? ""),
    disclaimer: DISCLAIMER,
  };
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
