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

/** Housing-radar categories each digest item is tagged with. */
export type DigestCategory =
  | "economy_rates"
  | "legislation_policy"
  | "programs_financing"
  | "schools_education"
  | "local_economy"
  | "market_trends"
  | "seasonal_other";

export const DIGEST_CATEGORIES: readonly DigestCategory[] = [
  "economy_rates",
  "legislation_policy",
  "programs_financing",
  "schools_education",
  "local_economy",
  "market_trends",
  "seasonal_other",
] as const;

/** Default category for items missing/with an unknown category (also the reader
 *  default for legacy stored digests written before category existed). */
export const DEFAULT_DIGEST_CATEGORY: DigestCategory = "market_trends";

/** Friendly, UI-facing label for each category (badges, cards). */
export const CATEGORY_LABEL: Record<DigestCategory, string> = {
  economy_rates: "Economy & Rates",
  legislation_policy: "Policy & Law",
  programs_financing: "Programs",
  schools_education: "Schools",
  local_economy: "Local Economy",
  market_trends: "Market",
  seasonal_other: "Seasonal",
};

export type DigestItem = {
  headline: string;
  summary: string;
  why_it_matters: string;
  source_url: string;
  publisher: string;
  /** Housing-radar category (defaults to 'market_trends' if missing/unknown). */
  category: DigestCategory;
  /** 2-letter US state code when the item is specific to one state, else null. */
  state: string | null;
  /** 'state' when a state is set, else 'national'. */
  scope: "national" | "state";
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

const SYSTEM_PROMPT = `You are a consumer real-estate news editor compiling this week's "This Week in Housing" RADAR for a general audience of home buyers and sellers. Your job is to scan the WHOLE housing landscape and surface what is genuinely NEW and TIME-SENSITIVE this week across many categories — not just mortgage rates. Use the web_search tool to find REAL, CURRENT, PUBLISHED information — do not rely on memory for any number, law, program, or ranking.

HARD RULES (a violation makes the digest unpublishable):
- EVERY factual claim (a mortgage rate, CPI/inflation print, jobs number, a new law or bill, a program's terms, a school-ranking result, an employer move, a price change) must come from a source you actually found via web_search. NEVER invent, round-guess, or "estimate" a number, a law, or a program detail. If you cannot verify it, omit that item — do not fabricate.
- Each item's "source_url" must be a real page URL you actually saw in a search result (starting http:// or https://), and "publisher" its publisher name (e.g. "Freddie Mac", "FRED / St. Louis Fed", "Bureau of Labor Statistics", "U.S. Census Bureau", "Zillow Research", "Redfin", "Realtor.com", "U.S. News", "GreatSchools", a state housing-finance agency, a city government, a local newspaper of record).
- Prefer primary/authoritative sources for each category. Do not overweight rates: rates are ONE category among several.

CATEGORIES — tag every item with exactly ONE "category" from this fixed list, and aim for a SPREAD across them (do NOT let the digest be all rates):
- "economy_rates" — economic conditions and mortgage rates: the Fed, CPI/inflation, the jobs report, the 30-year fixed and its week-over-week move, Treasury yields.
- "legislation_policy" — housing legislation & policy: new laws, zoning changes, rent rules/rent control, property-tax changes, transfer-tax or assessment changes, legislative-session outcomes.
- "programs_financing" — programs & financing: first-time-buyer programs, down-payment-assistance launches or changes, loan-program changes (FHA/VA/conforming loan limits), grant windows opening or closing.
- "schools_education" — schools & education: ranking releases (U.S. News, Niche, GreatSchools), district or attendance-boundary changes, big school news — a major driver of home values.
- "local_economy" — local economy: a major employer opening/relocating/laying off, a large development or project, notable regional job growth.
- "market_trends" — housing-market trends: prices, inventory, days-on-market, buyer/seller balance, a notable market story.
- "seasonal_other" — seasonal / other time-sensitive items: home-insurance and disaster-season updates (hurricane/wildfire), tax deadlines and assessment windows, seasonal shifts in the market.

SCOPE & STATE:
- If an item is specific to ONE U.S. state (a state law, a state program, a state-agency ranking, a metro story clearly within one state), set "state" to that state's 2-letter code (e.g. "CA", "TX", "FL") and "scope" to "state".
- Otherwise set "state" to null and "scope" to "national".

SEASONAL AWARENESS:
Recurring time-sensitive events cluster by season. Actively check whether any are CURRENT for this week's date and surface them:
- School & college rankings often release in LATE SUMMER / FALL (U.S. News Best High Schools / Best Colleges, Niche, GreatSchools updates).
- Property-tax, assessment, and tax-law changes cluster around YEAR-END and SPRING tax season (assessment notices, appeal deadlines, filing deadlines).
- Legislative-session OUTCOMES land when state sessions adjourn — surface newly signed housing laws taking effect.
- Home-insurance / disaster news peaks in HURRICANE and WILDFIRE season — new non-renewals, FAIR-plan changes, premium news.

CONSUMER VOICE:
Write for everyday buyers and sellers, NOT industry insiders. For each item, "why_it_matters" says what it means if you're buying or selling right now — monthly-payment impact, affordability, home values, timing, eligibility, negotiating leverage. Plain English, concrete, no jargon. Prioritize items that actually affect buyers'/sellers' decisions, home values, affordability, or timing.

Produce 6-8 ITEMS with a genuine SPREAD across the categories above.

When done searching, respond with EXACTLY ONE fenced JSON code block and nothing after it, matching this schema:

\`\`\`json
{
  "title": "Specific, dated headline for the week's housing radar",
  "intro": "2-3 sentence consumer-voice standfirst summarizing the week for buyers and sellers.",
  "items": [
    {
      "headline": "Short, specific headline for this item",
      "summary": "2-3 sentences of what happened, tied to the cited fact.",
      "why_it_matters": "1-2 sentences: what it means if you're buying or selling right now.",
      "source_url": "https://real-url-you-found",
      "publisher": "Freddie Mac",
      "category": "economy_rates",
      "state": null,
      "scope": "national"
    }
  ],
  "sources": [
    { "title": "Primary Mortgage Market Survey", "url": "https://...", "publisher": "Freddie Mac" }
  ]
}
\`\`\`

Write 6-8 items spread across categories. Keep prose original, concrete, and tied to the cited facts.`;

function buildUserPrompt(weekOf: string): string {
  return (
    `Compile this week's U.S. "This Week in Housing" radar for consumers. ` +
    `The week begins Monday ${weekOf}; today's date is ${new Date().toISOString().slice(0, 10)}.\n\n` +
    `Scan the WHOLE housing landscape for what is genuinely NEW / time-sensitive THIS WEEK, across categories — ` +
    `not just rates. web_search for:\n` +
    `- economy & rates: the current 30-year fixed (Freddie Mac PMMS / FRED) and its week-over-week move, plus any Fed / CPI / jobs / housing-starts release that actually happened this week;\n` +
    `- housing legislation & policy: new laws, zoning, rent rules, property-tax or assessment changes;\n` +
    `- programs & financing: first-time-buyer programs, down-payment assistance, loan-program / loan-limit changes;\n` +
    `- schools & education: any ranking release (U.S. News / Niche / GreatSchools) or district/boundary news;\n` +
    `- local economy: major employer moves, large developments, regional job growth;\n` +
    `- market trends: prices, inventory, days on market;\n` +
    `- seasonal / other: home-insurance & disaster-season updates, tax deadlines, seasonal shifts.\n\n` +
    `Check the calendar: given today's date, surface any recurring seasonal item that is CURRENT (e.g. fall school-ranking releases, tax-season assessment/appeal windows, hurricane/wildfire insurance news). ` +
    `Produce 6-8 items with a SPREAD across the categories, tag each with its "category", set "state"/"scope" for state-specific items, ` +
    `cite every fact to the source you found it on, then return the JSON.`
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
            "Extract the weekly housing-radar digest into ONE valid JSON object with keys: title, intro, items, sources. " +
            "Each item has: headline, summary, why_it_matters, source_url, publisher, category, state, scope. Each source has: title, url, publisher. " +
            "Use ONLY the numbers, URLs, categories, states, and text already present below — do not invent or change any value.\n\n" +
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

const CATEGORY_SET = new Set<string>(DIGEST_CATEGORIES);

/** Coerce an arbitrary value to a valid category, defaulting to market_trends. */
export function coerceCategory(v: unknown): DigestCategory {
  const raw = typeof v === "string" ? v.trim().toLowerCase() : "";
  return CATEGORY_SET.has(raw) ? (raw as DigestCategory) : DEFAULT_DIGEST_CATEGORY;
}

/** Coerce a value to a 2-letter US state code (uppercase) or null. */
export function coerceState(v: unknown): string | null {
  const raw = typeof v === "string" ? v.trim().toUpperCase() : "";
  return /^[A-Z]{2}$/.test(raw) ? raw : null;
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
      const state = coerceState(o.state);
      // scope follows state: 'state' when a state is set, else 'national'
      // (only trust an explicit 'state' scope when a valid state is present).
      const scope: "national" | "state" = state ? "state" : "national";
      return {
        headline,
        summary,
        why_it_matters: s(o.why_it_matters, ""),
        source_url,
        publisher: s(o.publisher, ""),
        category: coerceCategory(o.category),
        state,
        scope,
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
