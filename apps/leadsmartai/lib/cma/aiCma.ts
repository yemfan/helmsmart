import "server-only";

import { getAnthropicClient, isAnthropicConfigured } from "@/lib/anthropic";
import type { FetchSmartCmaInput, FetchSmartCmaResult } from "./fetchSmartCma";
import type { CmaSnapshot, CmaCompRow, CmaSource } from "./types";

/**
 * AI-grounded CMA producer — the Claude + live web search replacement for the
 * propertytoolsai comps engine (fetchSmartCma). Same input/result shape, so it
 * drops into createCmaForAgent unchanged.
 *
 * IMPORTANT — this is an *estimate*, not an appraisal. Claude is instructed to
 * only report comparable sales it actually finds via web search (with a source
 * URL each), never to invent comps or prices. Every snapshot carries a
 * disclaimer + the cited sources so the agent can verify before relying on it.
 *
 * Model: claude-opus-4-8 with the server-side web_search tool. The search loop
 * runs on Anthropic's side; we drive the pause_turn continuation loop here.
 */

const MODEL = "claude-opus-4-8";
const MAX_TOOL_ROUNDS = 8;

export const AI_CMA_DISCLAIMER =
  "AI-generated estimate from public web data (recent comparable sales). This is an opinion of value, not an appraisal — verify the comps and pricing before relying on it.";

const SYSTEM_PROMPT = `You are a real-estate valuation assistant producing a Comparative Market Analysis (CMA) for a listing agent. Use the web_search tool to find REAL, RECENT comparable sales — do not rely on memory.

Rules:
- Only include comps you actually found via web search, each with a real source URL. NEVER invent an address, price, or sale date. If you cannot find enough real comps, return fewer (or none) and say so in the summary — do not pad with fabrications.
- Prefer SOLD sales within the last ~12 months, within ~1–3 miles, with similar beds/baths/square footage and property type.
- Derive the value range from the comps' price-per-square-foot applied to the subject's size — show your math implicitly via avgPricePerSqft. Be conservative; widen the low/high band when comps are sparse or dispersed.
- Listing strategy prices: aggressive (slightly below market to drive offers), market (the estimated value), premium (a stretch for scarce/unique inventory), each with a rough projected days-on-market.

When done searching, respond with EXACTLY ONE fenced JSON code block and nothing after it, matching this schema (numbers only, no $ or commas):

\`\`\`json
{
  "subject": { "address": "", "beds": 0, "baths": 0, "sqft": 0, "propertyType": null, "yearBuilt": 0, "condition": null },
  "comps": [
    { "address": "", "price": 0, "sqft": 0, "beds": 0, "baths": 0, "distanceMiles": 0, "soldDate": "YYYY-MM-DD", "propertyType": null, "pricePerSqft": 0, "sourceUrl": "" }
  ],
  "valuation": { "estimatedValue": 0, "low": 0, "high": 0, "avgPricePerSqft": 0, "confidenceScore": null },
  "strategies": { "aggressive": 0, "market": 0, "premium": 0, "daysOnMarket": { "aggressive": 0, "market": 0, "premium": 0 } },
  "summary": "2-4 sentences: how many real comps were found, the range, and any caveats.",
  "sources": [ { "title": "", "url": "" } ]
}
\`\`\``;

type WebTool = { type: string; name: string; max_uses?: number };

export async function generateAiCma(input: FetchSmartCmaInput): Promise<FetchSmartCmaResult> {
  const address = input.address.trim();
  if (!address) return { ok: false, status: 400, error: "Subject address is required." };
  if (!isAnthropicConfigured()) {
    return { ok: false, status: 500, error: "AI CMA is unavailable — ANTHROPIC_API_KEY is not configured." };
  }

  const client = getAnthropicClient();

  const known: string[] = [];
  if (input.beds != null) known.push(`${input.beds} beds`);
  if (input.baths != null) known.push(`${input.baths} baths`);
  if (input.sqft != null) known.push(`${input.sqft} sqft`);
  if (input.yearBuilt != null) known.push(`built ${input.yearBuilt}`);
  if (input.condition) known.push(`condition: ${input.condition}`);

  const userPrompt =
    `Produce a CMA for this subject property:\n\nAddress: ${address}\n` +
    (known.length ? `Known characteristics: ${known.join(", ")}\n` : "") +
    `\nSearch the web for recent comparable sales near this address, then return the JSON.`;

  // web_search_20250305 is the stable server-side tool supported across the
  // 4.x family; cast because the installed SDK's typed tool union may predate it.
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

      // Server tool loop hit its internal cap — append the turn and resume.
      if (res?.stop_reason === "pause_turn") {
        messages.push({ role: "assistant", content: res.content });
        continue;
      }
      break;
    }
  } catch (e) {
    return {
      ok: false,
      status: 502,
      error: `AI CMA failed: ${e instanceof Error ? e.message : "unknown error"}`,
    };
  }

  if (!sawText) {
    return { ok: false, status: 502, error: "AI CMA returned no usable result." };
  }

  const parsed = extractJson(finalText);
  if (!parsed) {
    return { ok: false, status: 502, error: "Could not parse the AI CMA result." };
  }

  const snapshot = normalizeAi(parsed, address);
  if (snapshot.comps.length === 0 && snapshot.valuation.estimatedValue === 0) {
    return {
      ok: false,
      status: 422,
      error: "No real comparable sales could be found for this address. Try a more complete address.",
    };
  }
  return { ok: true, snapshot };
}

// ── parsing + normalization ──────────────────────────────────────

function extractJson(text: string): Record<string, unknown> | null {
  const fenced = text.match(/```json\s*([\s\S]*?)```/i);
  const candidate = fenced ? fenced[1] : sliceFirstObject(text);
  if (!candidate) return null;
  try {
    const obj = JSON.parse(candidate);
    return obj && typeof obj === "object" ? (obj as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

function sliceFirstObject(text: string): string | null {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  return start >= 0 && end > start ? text.slice(start, end + 1) : null;
}

function normalizeAi(raw: Record<string, unknown>, fallbackAddress: string): CmaSnapshot {
  const subject = (raw.subject ?? {}) as Record<string, unknown>;
  const valuation = (raw.valuation ?? {}) as Record<string, unknown>;
  const strat = raw.strategies as Record<string, unknown> | undefined;
  const dom = (strat?.daysOnMarket ?? {}) as Record<string, unknown>;
  const rawComps = Array.isArray(raw.comps) ? raw.comps : [];
  const rawSources = Array.isArray(raw.sources) ? raw.sources : [];

  const sources: CmaSource[] = rawSources
    .map((s) => {
      const o = (s ?? {}) as Record<string, unknown>;
      const url = str(o.url, "");
      return url ? { title: str(o.title, url), url } : null;
    })
    .filter((s): s is CmaSource => s !== null);

  return {
    subject: {
      address: str(subject.address, fallbackAddress),
      beds: num(subject.beds, 0),
      baths: num(subject.baths, 0),
      sqft: num(subject.sqft, 0),
      propertyType: subject.propertyType == null ? null : String(subject.propertyType),
      yearBuilt: num(subject.yearBuilt, 0),
      condition: subject.condition == null ? null : String(subject.condition),
    },
    comps: rawComps
      .map<CmaCompRow | null>((c) => {
        if (!c || typeof c !== "object") return null;
        const o = c as Record<string, unknown>;
        const address = str(o.address, "");
        if (!address) return null;
        // Fold a per-comp sourceUrl into the sources list.
        const sourceUrl = str(o.sourceUrl, "");
        if (sourceUrl && !sources.some((s) => s.url === sourceUrl)) {
          sources.push({ title: address, url: sourceUrl });
        }
        return {
          address,
          price: num(o.price, 0),
          sqft: num(o.sqft, 0),
          beds: o.beds == null ? null : num(o.beds, 0),
          baths: o.baths == null ? null : num(o.baths, 0),
          distanceMiles: num(o.distanceMiles, 0),
          soldDate: str(o.soldDate, ""),
          propertyType: o.propertyType == null ? null : String(o.propertyType),
          pricePerSqft: num(o.pricePerSqft, 0),
        };
      })
      .filter((x): x is CmaCompRow => x !== null),
    valuation: {
      estimatedValue: num(valuation.estimatedValue, 0),
      low: num(valuation.low, 0),
      high: num(valuation.high, 0),
      avgPricePerSqft: num(valuation.avgPricePerSqft, 0),
      // The DB column is an integer 1-95. Claude often returns a 0-1
      // confidence — scale it up, round, and clamp (null when absent).
      confidenceScore: toConfidenceInt(valuation.confidenceScore),
    },
    strategies: strat
      ? {
          aggressive: num(strat.aggressive, 0),
          market: num(strat.market, 0),
          premium: num(strat.premium, 0),
          daysOnMarket: {
            aggressive: num(dom.aggressive, 0),
            market: num(dom.market, 0),
            premium: num(dom.premium, 0),
          },
        }
      : null,
    summary: raw.summary == null ? null : String(raw.summary),
    valuationSource: "ai_web_search",
    sources,
    disclaimer: AI_CMA_DISCLAIMER,
  };
}

/** Coerce a model confidence to the integer 1-95 the DB column expects. */
function toConfidenceInt(v: unknown): number | null {
  if (v == null) return null;
  let n = num(v, NaN);
  if (!Number.isFinite(n)) return null;
  if (n > 0 && n <= 1) n = n * 100; // 0-1 confidence → percentage
  return Math.max(1, Math.min(95, Math.round(n)));
}

function num(v: unknown, fallback: number): number {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string") {
    const n = Number(v.replace(/[$,]/g, ""));
    return Number.isFinite(n) ? n : fallback;
  }
  return fallback;
}

function str(v: unknown, fallback: string): string {
  return typeof v === "string" && v.trim() ? v.trim() : fallback;
}
