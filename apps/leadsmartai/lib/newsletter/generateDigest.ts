import "server-only";
import { cachedSystem, markTranscriptCached } from "@leadsmart/shared/utils/promptCache";

import { DEFAULT_LOCALE, resolveLocale } from "@leadsmart/i18n";

import { getAnthropicClient, isAnthropicConfigured } from "@/lib/anthropic";
import { languageDirectiveForJson } from "@/lib/i18n/languageDirective";
import { attachItemImages } from "./itemImage";

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

/**
 * Friendly, UI-facing label for each category (badges, cards).
 *
 * This is the English map, kept as a plain export because most callers render
 * it in an English-only surface. Anything that renders beside translated digest
 * copy — the issue page, the email — must go through `categoryLabel()` instead,
 * or a Chinese newsletter grows English badges.
 */
export const CATEGORY_LABEL: Record<DigestCategory, string> = {
  economy_rates: "Economy & Rates",
  legislation_policy: "Policy & Law",
  programs_financing: "Programs",
  schools_education: "Schools",
  local_economy: "Local Economy",
  market_trends: "Market",
  seasonal_other: "Seasonal",
};

const CATEGORY_LABEL_ZH: Record<DigestCategory, string> = {
  economy_rates: "经济与利率",
  legislation_policy: "政策与法规",
  programs_financing: "购房计划",
  schools_education: "学区教育",
  local_economy: "本地经济",
  market_trends: "市场行情",
  seasonal_other: "季节性",
};

/** The category badge in the reader's language. Falls back to English. */
export function categoryLabel(
  category: DigestCategory,
  locale?: string | null,
): string {
  if (resolveLocale(locale) === "zh-Hans") {
    return CATEGORY_LABEL_ZH[category] ?? CATEGORY_LABEL[category];
  }
  return CATEGORY_LABEL[category];
}

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
  /**
   * The single scannable takeaway bullet — the punchy "so what" (≤ ~150 chars).
   * Newer field: legacy stored items lack it, so readers fall back to a trimmed
   * why_it_matters/summary (see coerceKeyPoint).
   */
  key_point?: string;
  /**
   * Public URL of a story image (og:image scraped from source_url, stored in the
   * newsletter-images bucket), or null when none could be attached. Best-effort:
   * cards render cleanly without it.
   */
  image_url?: string | null;
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

const SYSTEM_PROMPT = `You are the editor of "This Week in Housing," a polished weekly consumer newsletter for home buyers and sellers. Write like a professional publication: authoritative, concrete, active voice, no fluff or jargon. Your job is to scan the WHOLE housing landscape and surface what is genuinely NEW and TIME-SENSITIVE this week across many categories — not just mortgage rates. Use the web_search tool to find REAL, CURRENT, PUBLISHED information — do not rely on memory for any number, law, program, or ranking.

EDITORIAL VOICE & FORMAT (this is a professional newsletter, not a blog post):
- The issue TITLE is a clean, single-hook headline — ≤ 70 characters, ONE clear idea, title-case, NO comma-separated run-on lists. Good: "Rates Hit a 7-Week Low as Congress Passes a Housing Bill". Bad: "Mortgage rates fall, a new bill passes, schools rank, and insurance shifts this week".
- The INTRO is a tight standfirst (dek): 1-2 crisp sentences that set up the week for buyers and sellers. Not a dense paragraph.
- Every item is written to be SCANNED, not read as a wall of text. Give each item a "key_point" — ONE punchy bullet (≤ 150 characters) that states the takeaway / the "so what" up front. This is the lead line the reader sees.
- "headline" is a crisp, specific, title-case line (not a sentence with a period).
- "summary" is TIGHT: 1-2 sentences of what happened, tied to the cited fact. No padding.
- "why_it_matters" is ONE plain-English sentence about the impact on buying or selling right now.

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
  "title": "Clean single-hook headline for the week (≤70 chars, no comma run-ons)",
  "intro": "1-2 sentence standfirst (dek) summarizing the week for buyers and sellers.",
  "items": [
    {
      "headline": "Crisp, specific, title-case line for this item",
      "key_point": "The one punchy takeaway bullet — the 'so what' (≤150 chars).",
      "summary": "1-2 tight sentences of what happened, tied to the cited fact.",
      "why_it_matters": "ONE plain-English sentence: what it means if you're buying or selling now.",
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

Write 6-8 items spread across categories. Every item MUST have a "key_point". Keep prose original, concrete, editorial, and tied to the cited facts. Every number stays cited; never fabricate.`;

function buildUserPrompt(weekOf: string, locale: string): string {
  const lang = langBlock(locale);
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
    `cite every fact to the source you found it on, then return the JSON.\n\n` +
    `Write like a professional newsletter editor: a clean single-hook TITLE (≤70 chars, no comma run-ons), a tight 1-2 sentence standfirst INTRO, ` +
    `and for each item a punchy "key_point" bullet (the scannable "so what", ≤150 chars) plus a crisp title-case headline, a tight 1-2 sentence summary, ` +
    `and a one-sentence why_it_matters. Scannable, not walls of text.` +
    // The directive rides on the USER prompt, not the system prompt: the
    // system prompt is the cached prefix and it is identical for every
    // language, so keeping it untouched means the second and third variants
    // of a week reuse the cache instead of paying for it again.
    (lang ? `\n\n${lang}` : "")
  );
}

/**
 * The language instructions for one variant.
 *
 * Two things beyond the usual JSON directive. The digest is a CITED document —
 * `source_url` and `publisher` identify where a fact came from, and a
 * "translated" publisher points at nothing. And a national U.S. newsletter is
 * full of proper nouns (Freddie Mac, the CFPB, a state program's legal name)
 * that a reader has to be able to search for; those get kept with a gloss
 * rather than replaced.
 */
function langBlock(locale: string): string {
  const base = languageDirectiveForJson(locale);
  if (!base) return "";
  return `${base}
Citations are not copy: reproduce every "source_url" exactly, and keep "publisher" as the outlet's own name.
Keep the official name of any agency, law, program, index or company (Freddie Mac, CFPB, FHA, the bill's number) in English — gloss it in-line the first time if it helps, but a reader must still be able to search for it.`;
}

/**
 * Generate the national weekly digest for the week beginning Monday `weekOf`
 * (YYYY-MM-DD), written in `locale`. Returns null on any failure (best-effort)
 * so the cron never crashes on a bad run.
 *
 * One call produces ONE language. The cron runs it once per supported locale
 * and stores each result as its own row, because the digest is national — it
 * has no single reader whose language it could follow, so it has to exist in
 * all of them and let the send pick.
 */
export async function generateWeeklyDigest(
  weekOf: string,
  locale: string = DEFAULT_LOCALE,
): Promise<WeeklyDigest | null> {
  if (!isAnthropicConfigured()) {
    console.warn("[newsletter] ANTHROPIC_API_KEY not configured — cannot generate digest.");
    return null;
  }

  const client = getAnthropicClient();
  const userPrompt = buildUserPrompt(weekOf, locale);
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
          // Cached — identical every call, and the cached prefix covers the tools
        // sent ahead of it. See @leadsmart/shared/utils/promptCache.
        system: cachedSystem(SYSTEM_PROMPT) as never,
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
        // That turn holds the search results; move the breakpoint onto it
        // so the next round reads them from cache instead of re-paying.
        markTranscriptCached(messages as never);
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

  let digest: WeeklyDigest | null;
  const parsed = extractJson(finalText);
  if (!parsed) {
    // Last-ditch repair: ask the model to reformat its own output, reusing only
    // values already present (mirrors the research generator's repair pattern).
    const repaired = await repairJson(client, finalText);
    if (!repaired) {
      console.warn("[newsletter] could not parse or repair the model JSON.");
      return null;
    }
    digest = normalizeDigest(repaired);
  } else {
    digest = normalizeDigest(parsed);
  }

  if (!digest) return null;

  // Best-effort "a picture per story": attach an og:image per item (in place).
  // Never throws; any per-item failure leaves that item's image_url null.
  try {
    await attachItemImages(digest.items, weekOf);
  } catch (e) {
    console.warn("[newsletter] image attach step failed (non-fatal):", e instanceof Error ? e.message : e);
  }

  return digest;
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
            "Each item has: headline, key_point, summary, why_it_matters, source_url, publisher, category, state, scope. Each source has: title, url, publisher. " +
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

/** Max length for the scannable key-point bullet (soft cap, trimmed to a word). */
const KEY_POINT_MAX = 160;

/** Trim a string to <= max chars on a word boundary, appending an ellipsis. */
function trimToLength(text: string, max: number): string {
  const t = text.trim();
  if (t.length <= max) return t;
  const cut = t.slice(0, max);
  const lastSpace = cut.lastIndexOf(" ");
  return `${(lastSpace > max * 0.6 ? cut.slice(0, lastSpace) : cut).replace(/[\s,.;:—-]+$/, "")}…`;
}

/**
 * Resolve the scannable key-point bullet. Uses the model's key_point when
 * present; otherwise falls back to a trimmed why_it_matters, then summary — so
 * legacy stored items (written before key_point existed) still render a lead
 * bullet. Returns "" only if all three are empty.
 */
export function coerceKeyPoint(
  keyPoint: unknown,
  whyItMatters: unknown,
  summary: unknown,
): string {
  const kp = typeof keyPoint === "string" ? keyPoint.trim() : "";
  const why = typeof whyItMatters === "string" ? whyItMatters.trim() : "";
  const sum = typeof summary === "string" ? summary.trim() : "";
  const chosen = kp || why || sum;
  return chosen ? trimToLength(chosen, KEY_POINT_MAX) : "";
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
      const why_it_matters = s(o.why_it_matters, "");
      return {
        headline,
        summary,
        why_it_matters,
        source_url,
        publisher: s(o.publisher, ""),
        category: coerceCategory(o.category),
        state,
        scope,
        key_point: coerceKeyPoint(o.key_point, why_it_matters, summary),
        // image_url is attached later (best-effort) by attachItemImages().
        image_url: null,
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
