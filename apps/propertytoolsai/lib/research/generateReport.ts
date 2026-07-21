import "server-only";

import { getAnthropicClient, isAnthropicConfigured } from "@repo/valuation/server";
import { getRateSeries, formatRateSeriesForPrompt } from "./fred";
import type {
  ResearchKind,
  ResearchReport,
  ResearchSource,
  ResearchKeyStat,
  ResearchDataTable,
  ResearchAnalysis,
  ResearchSection,
  ResearchFaq,
} from "./types";

/**
 * Original-research report generator for the Data Center.
 *
 * Publishes small-cadence, DATED, CITED market reports grounded in real
 * published data — a weekly mortgage-rate report and a monthly housing-market
 * report. Uses Claude (sonnet) + the server-side web_search tool with the same
 * pause_turn continuation loop as the AI CMA engine (packages/valuation/aiCma).
 *
 * Two framings per report:
 *   - analysis_consumer: for PropertyTools.ai (buyers / sellers / investors)
 *   - analysis_agent:     for CloseBoss / leadsmartai (listing + buyer agents)
 * The underlying data/numbers are IDENTICAL across framings; only the narrative
 * lens differs. This lets the same report render on two domains without
 * duplicate-content risk.
 *
 * Grounding: for weekly_rates, real FRED observations (when FRED_API_KEY is
 * set) are handed to Claude as ground truth; otherwise Claude web_searches
 * Freddie Mac PMMS / FRED for the current numbers. For monthly_market, Claude
 * web_searches Zillow Research / Redfin Data Center / Realtor.com. EVERY number
 * must cite a source (a real URL or the FRED data) — no fabrication.
 */

const MODEL = "claude-sonnet-4-6";
// Must exceed WEB_SEARCH_MAX_USES so the loop keeps a round for the model to
// write its final answer AFTER the last search pauses the turn. Mirrors the
// aiCma ratio (rounds > uses).
const WEB_SEARCH_MAX_USES = 5;
const MAX_TOOL_ROUNDS = 12;
// web_search_tool_result blocks + thinking all count against output_tokens, so
// a low ceiling gets fully consumed by search results before the model ever
// writes the report. This task emits TWO analyses over many cited stats, so it
// needs a large budget: ~5 search results + thinking + the final JSON. Too low
// and the turn stops on max_tokens with zero text. Sonnet supports up to 64k.
const MAX_OUTPUT_TOKENS = 32000;

type WebTool = { type: string; name: string; max_uses?: number };

const SYSTEM_PROMPT = `You are a real-estate market researcher producing an ORIGINAL, DATED, CITED market report for publication. Use the web_search tool to find REAL, CURRENT, PUBLISHED data — do not rely on memory for any number.

HARD RULES (a violation makes the report unpublishable):
- EVERY numeric claim (rate, price, inventory count, days-on-market, YoY %, metro figure) must come from a source you actually found via web_search OR from ground-truth data provided in the prompt. NEVER invent, round-guess, or "estimate" a number. If you cannot find a figure, omit it — do not fabricate.
- Each source in "sources" must be a real page URL you actually saw in a search result, with its publisher (e.g. "Freddie Mac", "FRED / St. Louis Fed", "Zillow Research", "Redfin", "Realtor.com", "U.S. Census Bureau"). No fabricated URLs.
- Prefer primary/authoritative sources: Freddie Mac PMMS, FRED, Zillow Research, Redfin Data Center, Realtor.com Research, NAR, Census.
- Attach every key stat to a source via "source_index" (0-based index into the "sources" array).

TWO FRAMINGS, ONE DATASET:
You must produce TWO analysis narratives over the SAME numbers:
- "analysis_consumer": for a general audience of home buyers, sellers, and investors on a consumer property-tools site. Frame every point as "what this means if you're buying, selling, or investing right now" — affordability, monthly payment impact, timing, negotiating leverage.
- "analysis_agent": for real-estate AGENTS on an agent-CRM site. Same facts, but frame as "what this means for your listings, your buyers, and your pricing conversations" — how to advise clients, talk tracks, positioning, what to watch.
The numbers, stats, and sources are IDENTICAL between the two. Only the interpretation/advice differs. Do NOT introduce any new number in one framing that isn't grounded the same way.

When done searching, respond with EXACTLY ONE fenced JSON code block and nothing after it, matching this schema (values are strings unless noted; use null where noted):

\`\`\`json
{
  "title": "Specific, dated headline (include the week/month and the key movement)",
  "dek": "One-sentence standfirst summarizing the report",
  "period_label": "e.g. 'Week of July 3, 2026' or 'June 2026'",
  "key_stats": [
    { "label": "30-Yr Fixed", "value": "6.85%", "source_index": 0 }
  ],
  "data_table": {
    "caption": "Short table caption",
    "columns": ["Metric", "This Period", "Prior", "Change"],
    "rows": [["30-Yr Fixed", "6.85%", "6.80%", "+0.05"]]
  },
  "sources": [
    { "title": "Primary Mortgage Market Survey", "url": "https://...", "publisher": "Freddie Mac" }
  ],
  "analysis_consumer": {
    "sections": [ { "heading": "", "paragraphs": ["", ""] } ],
    "faqs": [ { "q": "", "a": "" } ]
  },
  "analysis_agent": {
    "sections": [ { "heading": "", "paragraphs": ["", ""] } ],
    "faqs": [ { "q": "", "a": "" } ]
  }
}
\`\`\`

Write 3-5 sections and 3-4 FAQs per framing. "data_table" may be null if a table doesn't fit. Keep prose original, concrete, and tied to the cited numbers.`;

function buildUserPrompt(kind: ResearchKind, groundTruth: string | null, today: string): string {
  if (kind === "weekly_rates") {
    const base =
      `Produce this week's U.S. MORTGAGE-RATE REPORT. Today is ${today}.\n\n` +
      `Cover: the current 30-year fixed, 15-year fixed, and 10-year Treasury; the week-over-week move; and the drivers behind it (Fed policy, inflation prints, bond-market moves) that you find via web search.\n\n`;
    if (groundTruth) {
      return (
        base +
        `You are given AUTHORITATIVE ground-truth rate data below — use these exact numbers for the rates and cite the FRED URLs provided. Then web_search for THIS WEEK's context/commentary explaining the movement (Freddie Mac PMMS commentary, Fed news, inflation data) and cite those sources too.\n\n` +
        `${groundTruth}\n\n` +
        `Now search for the surrounding context, then return the JSON.`
      );
    }
    return (
      base +
      `No ground-truth feed is available, so web_search Freddie Mac's Primary Mortgage Market Survey (PMMS) and/or FRED (MORTGAGE30US, MORTGAGE15US, DGS10) for the CURRENT numbers and cite them exactly. Then return the JSON.`
    );
  }

  // monthly_market
  return (
    `Produce this month's U.S. HOUSING-MARKET REPORT. Today is ${today}.\n\n` +
    `web_search for the most recent published national figures: median home sale/list price, active inventory / months of supply, median days on market, and year-over-year changes. Pull from Zillow Research, Redfin Data Center, and Realtor.com Research (and NAR/Census where relevant). Then identify a few notable metro movers (fastest-appreciating and cooling metros) with cited figures.\n\n` +
    `Cite every number to the source you found it on. Then return the JSON.`
  );
}

/**
 * Generate a research report. Returns null on any failure (best-effort) so the
 * caller/cron never crashes on a bad run.
 */
export async function generateResearchReport(kind: ResearchKind): Promise<ResearchReport | null> {
  if (!isAnthropicConfigured()) {
    console.warn("[research] ANTHROPIC_API_KEY not configured — cannot generate report.");
    return null;
  }

  const client = getAnthropicClient();
  const today = new Date().toISOString().slice(0, 10);

  // Ground truth: only for weekly_rates, only if FRED is configured.
  let groundTruth: string | null = null;
  if (kind === "weekly_rates") {
    try {
      const rates = await getRateSeries();
      if (rates) groundTruth = formatRateSeriesForPrompt(rates);
    } catch (e) {
      console.warn("[research] FRED fetch failed; falling back to web_search:", e);
    }
  }

  const userPrompt = buildUserPrompt(kind, groundTruth, today);
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
          `[research] ${kind}: hit max_tokens before any text (out_tokens=${usage.output_tokens}); ` +
            `raise MAX_OUTPUT_TOKENS or lower WEB_SEARCH_MAX_USES.`,
        );
      }
      break;
    }
  } catch (e) {
    console.warn("[research] generation failed:", e instanceof Error ? e.message : e);
    return null;
  }

  if (!sawText) {
    console.warn("[research] model returned no usable text.");
    return null;
  }

  const parsed = extractResearchJson(finalText);
  if (!parsed) {
    // Last-ditch repair: ask the model to reformat its own output, reusing only
    // values already present (mirrors the aiCma repair pattern).
    const repaired = await repairResearchJson(client, finalText);
    if (!repaired) {
      console.warn("[research] could not parse or repair the model JSON.");
      return null;
    }
    const r = normalizeReport(repaired, kind);
    if (!r) console.warn("[research] repaired JSON rejected by normalize (missing title/sections).");
    return r;
  }

  const report = normalizeReport(parsed, kind);
  if (!report) {
    console.warn("[research] normalize rejected the report (missing title or empty analysis sections).");
  }
  return report;
}

// ── JSON extraction (mirrors packages/valuation/jsonExtract) ────────────────

function extractResearchJson(text: string): Record<string, unknown> | null {
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

async function repairResearchJson(
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
            "Extract the market report into ONE valid JSON object with keys: title, dek, period_label, key_stats, data_table, sources, analysis_consumer, analysis_agent. " +
            "Use ONLY the numbers, URLs, and text already present below — do not invent or change any value. Use null where a value is genuinely absent.\n\n" +
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
    return extractResearchJson(repaired);
  } catch {
    return null;
  }
}

// ── normalization ───────────────────────────────────────────────────────────

function s(v: unknown, fallback = ""): string {
  return typeof v === "string" && v.trim() ? v.trim() : fallback;
}
function sOrNull(v: unknown): string | null {
  const out = s(v, "");
  return out ? out : null;
}
function toInt(v: unknown, fallback: number): number {
  if (typeof v === "number" && Number.isFinite(v)) return Math.trunc(v);
  if (typeof v === "string") {
    const n = Number(v);
    if (Number.isFinite(n)) return Math.trunc(n);
  }
  return fallback;
}

function normalizeSources(raw: unknown): ResearchSource[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((item): ResearchSource | null => {
      if (!item || typeof item !== "object") return null;
      const o = item as Record<string, unknown>;
      const url = s(o.url, "");
      if (!/^https?:\/\//i.test(url)) return null;
      return {
        title: s(o.title, url),
        url,
        publisher: s(o.publisher, ""),
      };
    })
    .filter((x): x is ResearchSource => x !== null);
}

function normalizeKeyStats(raw: unknown, sourceCount: number): ResearchKeyStat[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((item): ResearchKeyStat | null => {
      if (!item || typeof item !== "object") return null;
      const o = item as Record<string, unknown>;
      const label = s(o.label, "");
      const value = s(o.value, "");
      if (!label || !value) return null;
      let idx = toInt(o.source_index, -1);
      if (idx < 0 || idx >= sourceCount) idx = -1;
      return { label, value, sourceIndex: idx };
    })
    .filter((x): x is ResearchKeyStat => x !== null);
}

function normalizeDataTable(raw: unknown): ResearchDataTable | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const columns = Array.isArray(o.columns) ? o.columns.map((c) => s(c, "")) : [];
  const rowsRaw = Array.isArray(o.rows) ? o.rows : [];
  if (columns.length === 0 || rowsRaw.length === 0) return null;
  const rows = rowsRaw
    .filter((r): r is unknown[] => Array.isArray(r))
    .map((r) => r.map((cell) => s(cell, "")));
  if (rows.length === 0) return null;
  return { caption: s(o.caption, ""), columns, rows };
}

function normalizeAnalysis(raw: unknown): ResearchAnalysis {
  const o = (raw ?? {}) as Record<string, unknown>;
  const sectionsRaw = Array.isArray(o.sections) ? o.sections : [];
  const faqsRaw = Array.isArray(o.faqs) ? o.faqs : [];

  const sections: ResearchSection[] = sectionsRaw
    .map((item): ResearchSection | null => {
      if (!item || typeof item !== "object") return null;
      const sec = item as Record<string, unknown>;
      const heading = s(sec.heading, "");
      const paragraphs = Array.isArray(sec.paragraphs)
        ? sec.paragraphs.map((p) => s(p, "")).filter((p) => p.length > 0)
        : [];
      if (!heading && paragraphs.length === 0) return null;
      return { heading, paragraphs };
    })
    .filter((x): x is ResearchSection => x !== null);

  const faqs: ResearchFaq[] = faqsRaw
    .map((item): ResearchFaq | null => {
      if (!item || typeof item !== "object") return null;
      const f = item as Record<string, unknown>;
      const q = s(f.q, "");
      const a = s(f.a, "");
      if (!q || !a) return null;
      return { q, a };
    })
    .filter((x): x is ResearchFaq => x !== null);

  return { sections, faqs };
}

function normalizeReport(raw: Record<string, unknown>, kind: ResearchKind): ResearchReport | null {
  const sources = normalizeSources(raw.sources);
  const analysisConsumer = normalizeAnalysis(raw.analysis_consumer);
  const analysisAgent = normalizeAnalysis(raw.analysis_agent);
  const title = s(raw.title, "");

  // Reject an empty run: no title, or both framings blank — these would
  // otherwise be published as an empty report.
  if (!title) return null;
  if (analysisConsumer.sections.length === 0 || analysisAgent.sections.length === 0) return null;

  return {
    kind,
    title,
    dek: sOrNull(raw.dek),
    periodLabel: sOrNull(raw.period_label),
    keyStats: normalizeKeyStats(raw.key_stats, sources.length),
    dataTable: normalizeDataTable(raw.data_table),
    sources,
    analysisConsumer,
    analysisAgent,
  };
}
