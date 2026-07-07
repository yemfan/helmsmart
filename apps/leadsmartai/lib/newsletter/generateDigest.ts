import "server-only";

import { getAnthropicClient, isAnthropicConfigured } from "@/lib/anthropic";

/**
 * Weekly Regional Newsletter — NATIONAL digest generator.
 *
 * Produces the consumer-voice, cited NATIONAL rate + housing NEWS digest that
 * headlines every weekly issue. The REGIONAL market-data snapshot is layered on
 * per-issue at render time from the Data Center warehouse (see assembleIssue.ts);
 * this file only writes the national narrative.
 *
 * Uses Claude (sonnet) + the server-side web_search tool with the SAME
 * pause_turn continuation loop as apps/propertytoolsai's research generator
 * (lib/research/generateReport.ts). The three walls that generator hit are
 * reproduced here as guard rails:
 *   1. MUST STREAM — client.messages.stream({...}).finalMessage(), never a plain
 *      create() with a big max_tokens (that throws "Streaming is required for
 *      operations that may take longer than 10 minutes").
 *   2. Big output budget — MAX_OUTPUT_TOKENS = 32000. web_search_tool_result
 *      blocks + thinking count against output_tokens, so a small ceiling gets
 *      consumed before the model writes (stop_reason=max_tokens, no text).
 *   3. Rounds > search uses — MAX_TOOL_ROUNDS (12) must exceed web_search
 *      max_uses (5), so a round remains to WRITE after the last search pauses.
 *
 * Cite EVERY claim with a real URL found via web_search. No fabrication. Returns
 * null on any failure so the caller/cron never crashes.
 */

const MODEL = "claude-sonnet-4-6";
// Must exceed WEB_SEARCH_MAX_USES so a round remains for the model to WRITE the
// final answer after the last search pauses the turn. Mirrors the research
// generator's rounds > uses ratio.
const WEB_SEARCH_MAX_USES = 5;
const MAX_TOOL_ROUNDS = 12;
// web_search_tool_result blocks + thinking all count against output_tokens, so a
// low ceiling gets fully consumed by search results before the model ever writes
// (stop_reason=max_tokens with zero text). Sonnet supports up to 64k.
const MAX_OUTPUT_TOKENS = 32000;

type WebTool = { type: string; name: string; max_uses?: number };

export type DigestItem = {
  headline: string;
  summary: string;
  why_it_matters: string;
  source_url: string;
  publisher: string;
};

export type DigestSource = {
  title: string;
  url: string;
  publisher: string;
};

export type WeeklyDigest = {
  title: string;
  intro: string;
  items: DigestItem[];
  sources: DigestSource[];
};

const SYSTEM_PROMPT = `You are a consumer real-estate news editor writing this week's NATIONAL "rates + housing" briefing for a general audience of home buyers and sellers. Use the web_search tool to find REAL, CURRENT, PUBLISHED data — do not rely on memory for any number.

HARD RULES (a violation makes the digest unpublishable):
- EVERY numeric claim (mortgage rate, CPI/inflation print, jobs number, housing starts, price move) must come from a source you actually found via web_search. NEVER invent, round-guess, or "estimate" a number. If you cannot find a figure, omit that item — do not fabricate.
- Each item's "source_url" must be a real page URL you actually saw in a search result (starting http:// or https://), and "publisher" its publisher name (e.g. "Freddie Mac", "FRED / St. Louis Fed", "Bureau of Labor Statistics", "U.S. Census Bureau", "Zillow Research", "Redfin", "Realtor.com").
- Prefer primary/authoritative sources: Freddie Mac PMMS, FRED (MORTGAGE30US, MORTGAGE15US, DGS10), the Federal Reserve, BLS (CPI, jobs), Census (housing starts), Zillow Research, Redfin Data Center, Realtor.com Research, NAR.

CONSUMER VOICE:
Write for everyday buyers and sellers, NOT industry insiders. For each item, "why_it_matters" says what it means if you're buying or selling right now — monthly-payment impact, affordability, timing, negotiating leverage. Plain English, concrete, no jargon.

COVER 5-6 ITEMS this week, spanning:
- Mortgage rates (the current 30-year fixed from Freddie Mac PMMS / FRED, and the week-over-week move).
- The week's key economic data as relevant (Fed decision/minutes, CPI/inflation, jobs report, housing starts/permits) — only the releases that actually happened or are the week's headline.
- A notable national housing-market story (prices, inventory, days-on-market, a market trend piece).

When done searching, respond with EXACTLY ONE fenced JSON code block and nothing after it, matching this schema (all values strings):

\`\`\`json
{
  "title": "Specific, dated headline for the week (include the week and the key movement)",
  "intro": "2-3 sentence consumer-voice standfirst summarizing the week for buyers and sellers.",
  "items": [
    {
      "headline": "Short, specific headline for this item",
      "summary": "2-3 sentences of what happened, tied to the cited number.",
      "why_it_matters": "1-2 sentences: what it means if you're buying or selling right now.",
      "source_url": "https://real-url-you-found",
      "publisher": "Freddie Mac"
    }
  ],
  "sources": [
    { "title": "Primary Mortgage Market Survey", "url": "https://...", "publisher": "Freddie Mac" }
  ]
}
\`\`\`

Write 5-6 items. Keep prose original, concrete, and tied to the cited numbers.`;

function buildUserPrompt(weekOf: string): string {
  return (
    `Produce this week's U.S. NATIONAL rates + housing news digest for consumers. ` +
    `The week begins Monday ${weekOf}; today's date is ${new Date().toISOString().slice(0, 10)}.\n\n` +
    `web_search Freddie Mac PMMS and/or FRED for the CURRENT 30-year fixed mortgage rate and its week-over-week move; ` +
    `search for THIS WEEK's key economic releases (Fed, CPI/inflation, jobs report, housing starts) and their reported numbers; ` +
    `and find one notable national housing-market story (prices / inventory / days on market). ` +
    `Cite every number to the source you found it on, then return the JSON.`
  );
}

/**
 * Generate the national weekly digest for the week beginning Monday `weekOf`
 * (YYYY-MM-DD). Returns null on any failure (best-effort) so the cron never
 * crashes on a bad run.
 */
export async function generateWeeklyDigest(weekOf: string): Promise<WeeklyDigest | null> {
  if (!isAnthropicConfigured()) {
    console.warn("[newsletter] ANTHROPIC_API_KEY not configured — cannot generate digest.");
    return null;
  }

  const client = getAnthropicClient();
  const userPrompt = buildUserPrompt(weekOf);
  const tools = [
    { type: "web_search_20250305", name: "web_search", max_uses: WEB_SEARCH_MAX_USES } as WebTool,
  ];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const messages: any[] = [{ role: "user", content: userPrompt }];

  let finalText = "";
  let sawText = false;
  try {
    for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
      // Stream + await finalMessage: a large max_tokens can push the estimated
      // request time past the SDK's 10-minute non-streaming ceiling (which
      // throws "Streaming is required…"). finalMessage() returns the same
      // Message shape as create(), so the rest of the loop is unchanged.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const res: any = await client.messages
        .stream({
          model: MODEL,
          max_tokens: MAX_OUTPUT_TOKENS,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          thinking: { type: "adaptive" } as any,
          system: SYSTEM_PROMPT,
          messages,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          tools: tools as any,
        })
        .finalMessage();

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
      // Terminal round. A max_tokens stop with no text means the budget was
      // consumed by thinking + search results before the model could write —
      // surface it so a regression here is diagnosable from logs.
      if (res?.stop_reason === "max_tokens" && !sawText) {
        const usage = (res?.usage ?? {}) as { output_tokens?: number };
        console.warn(
          `[newsletter] hit max_tokens before any text (out_tokens=${usage.output_tokens}); ` +
            `raise MAX_OUTPUT_TOKENS or lower WEB_SEARCH_MAX_USES.`,
        );
      }
      break;
    }
  } catch (e) {
    console.warn("[newsletter] generation failed:", e instanceof Error ? e.message : e);
    return null;
  }

  if (!sawText) {
    console.warn("[newsletter] model returned no usable text.");
    return null;
  }

  const parsed = extractJson(finalText);
  if (!parsed) {
    // Last-ditch repair: ask the model to reformat its own output, reusing only
    // values already present (mirrors the research generator's repair pattern).
    const repaired = await repairJson(client, finalText);
    if (!repaired) {
      console.warn("[newsletter] could not parse or repair the model JSON.");
      return null;
    }
    return normalizeDigest(repaired);
  }

  return normalizeDigest(parsed);
}

// ── JSON extraction (mirrors the research generator) ────────────────────────

function extractJson(text: string): Record<string, unknown> | null {
  for (const candidate of jsonCandidates(text)) {
    const obj = tryParseJson(candidate);
    if (obj) return obj;
  }
  return null;
}

function* jsonCandidates(text: string): Generator<string> {
  const fences: string[] = [];
  const fenceRe = /```(?:json)?\s*([\s\S]*?)```/gi;
  for (let m = fenceRe.exec(text); m; m = fenceRe.exec(text)) {
    if (m[1] && m[1].includes("{")) fences.push(m[1].trim());
  }
  for (let i = fences.length - 1; i >= 0; i--) yield fences[i];
  const end = text.lastIndexOf("}");
  if (end >= 0) {
    let depth = 0;
    for (let i = end; i >= 0; i--) {
      const ch = text[i];
      if (ch === "}") depth++;
      else if (ch === "{" && --depth === 0) {
        yield text.slice(i, end + 1);
        break;
      }
    }
  }
  const start = text.indexOf("{");
  if (start >= 0 && end > start) yield text.slice(start, end + 1);
}

function tryParseJson(raw: string): Record<string, unknown> | null {
  const cleaned = raw
    .trim()
    .replace(/^[^{]*/, "")
    .replace(/[^}]*$/, "")
    .replace(/,\s*([}\]])/g, "$1");
  try {
    const obj = JSON.parse(cleaned);
    return obj && typeof obj === "object" && !Array.isArray(obj)
      ? (obj as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

async function repairJson(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  client: any,
  text: string,
): Promise<Record<string, unknown> | null> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const res: any = await client.messages.create({
      model: MODEL,
      max_tokens: 12000,
      system:
        "You reformat content into valid JSON. Output ONLY a single JSON object — no prose, no markdown fences, no commentary.",
      messages: [
        {
          role: "user",
          content:
            "Extract the weekly news digest into ONE valid JSON object with keys: title, intro, items, sources. " +
            "Each item has: headline, summary, why_it_matters, source_url, publisher. Each source has: title, url, publisher. " +
            "Use ONLY the numbers, URLs, and text already present below — do not invent or change any value.\n\n" +
            text.slice(0, 16000),
        },
      ],
    });
    const out: unknown[] = Array.isArray(res?.content) ? res.content : [];
    let repaired = "";
    for (const block of out) {
      const b = block as { type?: string; text?: string };
      if (b.type === "text" && typeof b.text === "string") repaired += b.text;
    }
    return extractJson(repaired);
  } catch {
    return null;
  }
}

// ── normalization ────────────────────────────────────────────────────────────

function s(v: unknown, fallback = ""): string {
  return typeof v === "string" && v.trim() ? v.trim() : fallback;
}

function isHttpUrl(url: string): boolean {
  return /^https?:\/\//i.test(url);
}

function normalizeItems(raw: unknown): DigestItem[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((item): DigestItem | null => {
      if (!item || typeof item !== "object") return null;
      const o = item as Record<string, unknown>;
      const headline = s(o.headline, "");
      const summary = s(o.summary, "");
      const source_url = s(o.source_url, "");
      // Drop items without a headline/summary or whose source isn't a real URL.
      if (!headline || !summary) return null;
      if (!isHttpUrl(source_url)) return null;
      return {
        headline,
        summary,
        why_it_matters: s(o.why_it_matters, ""),
        source_url,
        publisher: s(o.publisher, ""),
      };
    })
    .filter((x): x is DigestItem => x !== null);
}

function normalizeSources(raw: unknown): DigestSource[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((item): DigestSource | null => {
      if (!item || typeof item !== "object") return null;
      const o = item as Record<string, unknown>;
      const url = s(o.url, "");
      if (!isHttpUrl(url)) return null;
      return { title: s(o.title, url), url, publisher: s(o.publisher, "") };
    })
    .filter((x): x is DigestSource => x !== null);
}

function normalizeDigest(raw: Record<string, unknown>): WeeklyDigest | null {
  const title = s(raw.title, "");
  const items = normalizeItems(raw.items);
  // Reject an empty run: no title, or no cited items would publish an empty digest.
  if (!title) return null;
  if (items.length === 0) return null;

  return {
    title,
    intro: s(raw.intro, ""),
    items,
    sources: normalizeSources(raw.sources),
  };
}
