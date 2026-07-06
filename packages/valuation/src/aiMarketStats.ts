import "server-only";

import { getAnthropicClient, isAnthropicConfigured } from "./anthropic";
import { extractJson, repairJsonToObject, numOrNull, str, httpUrl } from "./jsonExtract";

/**
 * AI-grounded city market-stats fetch — Claude + live web search. Replaces the
 * seed-only market numbers (curated after RentCast removal) with current
 * figures pulled from public real-estate market pages (Redfin/Zillow/Realtor
 * market data, NAR). Same pattern as aiCma / aiPropertyLookup.
 *
 * IMPORTANT — no fabrication. Claude returns null for any figure it cannot find
 * on a real page, and cites its sources. Callers (cityDataEngine.getCityData)
 * fall back to seed data when the AI returns nothing, and cache the result 24h,
 * so the AI cost is bounded (the daily refreshAllCitiesDaily cron drives it).
 */

const MODEL = "claude-sonnet-4-6";
const MAX_TOOL_ROUNDS = 4;

export type MarketStats = {
  medianPrice: number | null;
  pricePerSqft: number | null;
  daysOnMarket: number | null;
  inventory: number | null;
  trend: "up" | "down" | "stable";
  yoyChangePct: number | null;
  sources: { title: string; url: string }[];
};

export type MarketStatsResult =
  | { ok: true; stats: MarketStats }
  | { ok: false; status: number; error: string };

const SYSTEM_PROMPT = `You are a real-estate market analyst. Given a US city and state, use the web_search tool to find the CURRENT residential real-estate market statistics for that city from public sources (Redfin, Zillow, or Realtor.com market/housing-data pages, NAR). Do NOT rely on memory.

Rules:
- Return ONLY figures you actually find on a real page you visited. NEVER invent a number. Use null for anything you cannot verify.
- medianPrice is the median sale/list price in dollars. pricePerSqft is the median price per square foot in dollars. daysOnMarket is the median days a home is on the market. inventory is the active listing count / homes-for-sale count. yoyChangePct is the year-over-year median-price change as a percentage (e.g. 3.5 for +3.5%, -2.1 for a decline).
- Cite every source you drew a figure from.

When done searching, respond with EXACTLY ONE fenced JSON code block and nothing after it (numbers only, no $ or commas):

\`\`\`json
{
  "medianPrice": null,
  "pricePerSqft": null,
  "daysOnMarket": null,
  "inventory": null,
  "yoyChangePct": null,
  "sources": [ { "title": "", "url": "" } ]
}
\`\`\``;

type WebTool = { type: string; name: string; max_uses?: number };

function deriveTrend(yoyPct: number | null): "up" | "down" | "stable" {
  if (yoyPct == null) return "stable";
  if (yoyPct > 1) return "up";
  if (yoyPct < -1) return "down";
  return "stable";
}

/** Fetch AI-sourced current market stats for a city/state. */
export async function aiMarketStats(city: string, state: string): Promise<MarketStatsResult> {
  const c = (city ?? "").trim();
  const s = (state ?? "").trim();
  if (!c || !s) return { ok: false, status: 400, error: "City and state are required." };
  if (!isAnthropicConfigured()) {
    return { ok: false, status: 500, error: "AI market stats are unavailable — ANTHROPIC_API_KEY is not configured." };
  }

  const client = getAnthropicClient();

  const userPrompt =
    `Find the current residential real-estate market statistics for this city:\n\n` +
    `City: ${c}, ${s}\n\n` +
    `Search the web for this city's current market data, then return the JSON.`;

  const tools = [{ type: "web_search_20250305", name: "web_search", max_uses: 4 } as WebTool];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const messages: any[] = [{ role: "user", content: userPrompt }];

  let finalText = "";
  let sawText = false;
  try {
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
    return {
      ok: false,
      status: 502,
      error: `AI market stats failed: ${e instanceof Error ? e.message : "unknown error"}`,
    };
  }

  if (!sawText) {
    return { ok: false, status: 502, error: "AI market stats returned no usable result." };
  }

  let parsed = extractJson(finalText);
  if (!parsed) {
    parsed = await repairJsonToObject(
      client,
      MODEL,
      finalText,
      "Extract the market stats into ONE valid JSON object with keys medianPrice, pricePerSqft, daysOnMarket, inventory, yoyChangePct, sources. Use ONLY values already present below — do not invent. Use null for anything genuinely absent.",
    );
  }
  if (!parsed) {
    return { ok: false, status: 502, error: "Could not parse the AI market stats result." };
  }

  return { ok: true, stats: normalizeStats(parsed) };
}

function normalizeStats(raw: Record<string, unknown>): MarketStats {
  const rawSources = Array.isArray(raw.sources) ? raw.sources : [];
  const sources = rawSources
    .map((src) => {
      const o = (src ?? {}) as Record<string, unknown>;
      const url = httpUrl(o.url);
      return url ? { title: str(o.title, url), url } : null;
    })
    .filter((src): src is { title: string; url: string } => src !== null);

  const yoyChangePct = numOrNull(raw.yoyChangePct);

  return {
    medianPrice: numOrNull(raw.medianPrice),
    pricePerSqft: numOrNull(raw.pricePerSqft),
    daysOnMarket: numOrNull(raw.daysOnMarket),
    inventory: numOrNull(raw.inventory),
    trend: deriveTrend(yoyChangePct),
    yoyChangePct,
    sources,
  };
}
