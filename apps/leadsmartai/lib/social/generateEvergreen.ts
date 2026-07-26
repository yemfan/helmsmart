import "server-only";

import { getAnthropicClient, isAnthropicConfigured } from "@/lib/anthropic";
import { DISTRIBUTION_RULES } from "@/lib/social/reachRules";

/**
 * Evergreen social-content generator for the shared social_content_library.
 *
 * Produces TIMELESS, consumer-useful real-estate posts (tips, pitfalls,
 * how-tos) that the weekly Marketing Assistant recommender draws its EVERGREEN
 * picks from. This is the "advice that's true this year and next" half of the
 * content database — the TIMELY half (this week's rates/prices/stories) comes
 * from the newsletter digest at recommend time, NOT from here.
 *
 * Uses Claude (sonnet) with NO web_search: evergreen advice must not depend on,
 * or assert, any specific current number. The prompt hard-forbids concrete
 * rates/prices/percentages/law citations so a stale library row can never be
 * wrong. We STREAM (the batch output is large) with the same
 * .stream().finalMessage() shape as lib/newsletter/generateDigest.ts.
 *
 * Returns a validated array; malformed items are dropped. Best-effort: returns
 * [] on any failure so the seed route never crashes.
 */

const MODEL = "claude-sonnet-4-6";
// Big batch (~24-30 posts) → generous output budget. No web_search here, so no
// rounds/uses interplay; a single streamed turn writes the whole JSON array.
const MAX_OUTPUT_TOKENS = 16000;

export const SOCIAL_CATEGORIES = [
  "buying",
  "selling",
  "financing",
  "market_basics",
  "pitfalls",
  "how_to",
  "staging",
  "negotiation",
] as const;

export type SocialCategory = (typeof SOCIAL_CATEGORIES)[number];

export type EvergreenPost = {
  category: SocialCategory;
  title: string;
  hook: string;
  body: string;
  hashtags: string[];
  image_prompt: string;
  cta: string;
};

const CATEGORY_SET = new Set<string>(SOCIAL_CATEGORIES);

const SYSTEM_PROMPT = `You are a real-estate content strategist writing an EVERGREEN social-media post library for a real-estate agent to share with home buyers and sellers. These posts must stay useful and correct for years — they are NOT tied to this week's news.

HARD RULES (a violation makes a post unusable — omit any post you can't write within them):
- NEVER state a specific mortgage rate, interest rate, home price, price change, percentage, dollar figure, tax figure, or "the market is up/down" claim. Those change constantly and belong to the timely feed, not here. Keep every post true regardless of when it is read.
- NEVER cite a specific law, statute, tax code section, program dollar amount, or filing deadline (rules and numbers vary by state and year). You may reference general CONCEPTS ("closing costs", "earnest money", "an inspection contingency", "PMI") but not their current figures.
- No fabricated statistics or "studies show" claims. Write practical, experience-based guidance, not invented data.

VOICE: Write for everyday buyers and sellers, not industry insiders. Practical, specific, and genuinely helpful — the kind of tip a great agent tells a client over coffee. Avoid generic filler ("location, location, location", "it's a great time to buy"). Each post should teach one concrete, non-obvious thing.

Spread the posts across ALL of these categories (roughly even; every category represented):
- buying: smart moves for home buyers (search, offers, walkthroughs, closing)
- selling: preparing and selling a home well
- financing: mortgages/pre-approval/costs as timeless concepts (no current rates/numbers)
- market_basics: how real estate works (contingencies, escrow, appraisals, comps) explained plainly
- pitfalls: common mistakes buyers/sellers make and how to avoid them
- how_to: step-by-step practical guides (how to prep for a showing, how to read a settlement statement, etc.)
- staging: making a home show its best
- negotiation: negotiating offers, repairs, and terms

${DISTRIBUTION_RULES}

For EACH post return an object with:
- "category": exactly one of the category keys above
- "title": a short unique internal title (3-8 words), distinct from every other post
- "hook": the scroll-stopping FIRST LINE of the post (one punchy sentence) — obeys HOOK HARD above
- "body": 2-4 sentences of the actual post (the practical advice); saveable, one idea, no URL in the text
- "hashtags": array of 3-5 relevant hashtags, each starting with # (e.g. "#homebuying")
- "image_prompt": a one-line suggestion for an accompanying image the agent could generate
- "cta": a short closing line that INVITES A REPLY — a light question or soft invitation (e.g. "Thinking of buying? What's the one thing holding you back?"). Not a bare URL.

Return EXACTLY ONE fenced JSON code block and nothing after it, an object with a "posts" array:

\`\`\`json
{
  "posts": [
    {
      "category": "buying",
      "title": "Short unique title",
      "hook": "One punchy first line.",
      "body": "2-4 sentences of practical, timeless advice.",
      "hashtags": ["#homebuying", "#realestatetips", "#firsttimehomebuyer"],
      "image_prompt": "A cozy living room with warm natural light.",
      "cta": "Thinking of buying? Let's talk."
    }
  ]
}
\`\`\``;

function buildUserPrompt(n: number): string {
  return (
    `Write ${n} EVERGREEN real-estate social posts spread across all eight categories ` +
    `(roughly even coverage). Every post must be practical, specific, and non-generic, and must ` +
    `follow the hard rules — no specific rates, prices, percentages, dollar figures, or law citations. ` +
    `Return the single JSON object with the "posts" array.`
  );
}

/**
 * Generate a batch of ~`n` evergreen posts. Returns validated, deduped-by-title
 * posts (malformed entries dropped). Returns [] on any failure.
 */
export async function generateEvergreenBatch(n = 28): Promise<EvergreenPost[]> {
  if (!isAnthropicConfigured()) {
    console.warn("[social] ANTHROPIC_API_KEY not configured — cannot generate evergreen batch.");
    return [];
  }

  const client = getAnthropicClient();
  const userPrompt = buildUserPrompt(n);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const messages: any[] = [{ role: "user", content: userPrompt }];

  let finalText = "";
  try {
    // Stream + finalMessage: the batch output is large, so a plain create() with
    // a big max_tokens can trip the SDK's 10-minute non-streaming ceiling. Same
    // shape as the newsletter digest generator.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const res: any = await client.messages
      .stream({
        model: MODEL,
        max_tokens: MAX_OUTPUT_TOKENS,
        system: SYSTEM_PROMPT,
        messages,
      })
      .finalMessage();

    const content: unknown[] = Array.isArray(res?.content) ? res.content : [];
    for (const block of content) {
      const b = block as { type?: string; text?: string };
      if (b.type === "text" && typeof b.text === "string") finalText += b.text;
    }
  } catch (e) {
    console.warn("[social] evergreen generation failed:", e instanceof Error ? e.message : e);
    return [];
  }

  if (!finalText.trim()) {
    console.warn("[social] model returned no usable text.");
    return [];
  }

  const parsed = extractJson(finalText);
  if (!parsed) {
    console.warn("[social] could not parse model JSON.");
    return [];
  }

  const rawPosts = Array.isArray((parsed as { posts?: unknown }).posts)
    ? ((parsed as { posts: unknown[] }).posts as unknown[])
    : [];

  const seenTitles = new Set<string>();
  const out: EvergreenPost[] = [];
  for (const item of rawPosts) {
    const post = normalizePost(item);
    if (!post) continue;
    const key = post.title.toLowerCase();
    if (seenTitles.has(key)) continue;
    seenTitles.add(key);
    out.push(post);
  }
  return out;
}

// ── validation ──────────────────────────────────────────────────────────────

function s(v: unknown, fallback = ""): string {
  return typeof v === "string" && v.trim() ? v.trim() : fallback;
}

function normalizeHashtags(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const tags = raw
    .map((t) => (typeof t === "string" ? t.trim() : ""))
    .filter(Boolean)
    .map((t) => (t.startsWith("#") ? t : `#${t}`))
    .slice(0, 5);
  return Array.from(new Set(tags));
}

function normalizePost(item: unknown): EvergreenPost | null {
  if (!item || typeof item !== "object") return null;
  const o = item as Record<string, unknown>;
  const category = s(o.category, "");
  const title = s(o.title, "");
  const hook = s(o.hook, "");
  const body = s(o.body, "");
  // Drop items missing any load-bearing field or with an unknown category.
  if (!CATEGORY_SET.has(category)) return null;
  if (!title || !hook || !body) return null;
  return {
    category: category as SocialCategory,
    title,
    hook,
    body,
    hashtags: normalizeHashtags(o.hashtags),
    image_prompt: s(o.image_prompt, ""),
    cta: s(o.cta, ""),
  };
}

// ── JSON extraction (mirrors lib/newsletter/generateDigest.ts) ────────────────

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
