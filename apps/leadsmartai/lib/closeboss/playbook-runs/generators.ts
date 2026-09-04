import "server-only";

import { getAnthropicClient } from "@/lib/anthropic";
import type { PropertyAd } from "./types";
import { languageDirectiveForJson } from "@/lib/i18n/languageDirective";

/**
 * AI generators for the selling playbook. Both are self-contained Claude calls
 * (no web search) — grounded ONLY in the address + optional pricing context the
 * caller passes; they never invent a price or address of their own.
 */

const MODEL = "claude-sonnet-4-6";

function firstText(content: { type: string; text?: string }[]): string {
  const tb = content.find((b) => b.type === "text");
  return tb && tb.type === "text" ? (tb.text ?? "") : "";
}

function extractJson(text: string): unknown {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced ? fenced[1] : text;
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  if (start === -1 || end === -1 || end < start) return null;
  try {
    return JSON.parse(candidate.slice(start, end + 1));
  } catch {
    return null;
  }
}

export type MarketingPlanResult = { plan: string; channels: string[] };

/** A concrete, timed marketing plan for a listing. */
/**
 * @param locale The language the AGENT reads. This plan is theirs to work
 *   from — `generatePropertyAds` below is deliberately NOT given this,
 *   because an ad is read by the public, not by the agent.
 */
export async function generateMarketingPlan(args: {
  address: string;
  priceContext?: string | null;
  locale?: string | null;
}): Promise<MarketingPlanResult> {
  const client = getAnthropicClient();
  const res = await client.messages.create({
    model: MODEL,
    max_tokens: 1400,
    system:
      "You are the Marketing Assistant on a real estate agent's AI team. Write a concrete, actionable listing marketing plan for the given property. " +
      "Structure it with short sections: Positioning, Channels (MLS/portals, social, email, paid, signage), Timeline (week 1 / week 2-3 / ongoing), and Open house cadence. " +
      "Keep it tight and skimmable — bullets over paragraphs. Use ONLY the address and any pricing context provided; never invent a price, comps, or facts. " +
      "Output ONLY a JSON object: { \"plan\": string (the plan as markdown), \"channels\": string[] (the channels you'll use, short labels) }." +
        languageDirectiveForJson(args.locale),
    messages: [
      {
        role: "user",
        content: `Property: ${args.address}${args.priceContext ? `\nPricing context: ${args.priceContext}` : ""}\n\nWrite the marketing plan now.`,
      },
    ],
  });
  const parsed = extractJson(firstText(res.content)) as
    | { plan?: unknown; channels?: unknown }
    | null;
  const plan = typeof parsed?.plan === "string" && parsed.plan.trim() ? parsed.plan.trim() : firstText(res.content).trim();
  const channels = Array.isArray(parsed?.channels)
    ? parsed.channels.filter((c): c is string => typeof c === "string").slice(0, 8)
    : ["MLS", "Zillow/Redfin/realtor.com", "Social", "Email"];
  return { plan: plan.slice(0, 6000), channels };
}

/** Three distinct property ad creatives — separate from the standard listing post. */
export async function generatePropertyAds(args: {
  address: string;
  priceContext?: string | null;
}): Promise<PropertyAd[]> {
  const client = getAnthropicClient();
  const res = await client.messages.create({
    model: MODEL,
    max_tokens: 1600,
    system:
      "You are the Marketing Assistant on a real estate agent's AI team. Write THREE distinct ad creatives for the given listing — each targeting a different angle/audience " +
      "(e.g. first-time buyers, investors, luxury/lifestyle, downsizers, commuters — pick the three that fit best). " +
      "Fair-housing safe: describe the PROPERTY and lifestyle, never the ideal buyer's protected characteristics. Use ONLY the address + any pricing context; never invent a price or facts. " +
      'Output ONLY a JSON object: { "ads": [ { "angle": string, "audience": string, "headline": string (<=60 chars), "primaryText": string (2-4 sentences), "cta": string } x3 ] }.',
    messages: [
      {
        role: "user",
        content: `Property: ${args.address}${args.priceContext ? `\nPricing context: ${args.priceContext}` : ""}\n\nWrite the three ads now.`,
      },
    ],
  });
  const parsed = extractJson(firstText(res.content)) as { ads?: unknown } | null;
  const raw = Array.isArray(parsed?.ads) ? parsed.ads : [];
  const ads: PropertyAd[] = raw
    .map((a) => a as Record<string, unknown>)
    .filter((a) => a && typeof a === "object")
    .map((a) => ({
      angle: String(a.angle ?? "").slice(0, 80),
      audience: String(a.audience ?? "").slice(0, 80),
      headline: String(a.headline ?? "").slice(0, 120),
      primaryText: String(a.primaryText ?? "").slice(0, 800),
      cta: String(a.cta ?? "Contact us for a private tour").slice(0, 80),
    }))
    .filter((a) => a.headline || a.primaryText)
    .slice(0, 3);
  return ads;
}
