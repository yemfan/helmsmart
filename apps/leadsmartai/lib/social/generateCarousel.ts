import "server-only";

import { screenClaims } from "@helm/dna-marketing";

import { getAnthropicClient, isAnthropicConfigured } from "@/lib/anthropic";
import {
  BRAND_FORBIDDEN_NAMES,
  BRAND_SANCTIONED_NUMBERS,
  PRODUCT_CAPABILITIES,
  PRODUCT_NOT_TRUE,
} from "@/lib/social/productFacts";
import { DISTRIBUTION_RULES } from "@/lib/social/reachRules";

/**
 * Brand-voice CAROUSEL generator — Phase 3a of the reach roadmap.
 *
 * Carousels are the format the interest-graph feeds reward most after video:
 * each swipe is dwell time, and a saveable multi-slide sequence gets shared.
 * This is the sibling of generateBrandPosts.ts (same audience — REALTORS — and
 * the same "never claim a capability we don't ship" guardrails), but instead of
 * one caption it produces an ordered SLIDE DECK plus the accompanying caption.
 *
 * Shape of a carousel:
 *   - slides[0]      → COVER: the scroll-stopper. A few big words, one idea.
 *   - slides[1..n-1] → POINTS: one saveable idea per slide (a mini how-to /
 *                      list / reframe). heading = the point, body = one tight line.
 *   - slides[last]   → CLOSE: invites a reply or a save. No URL, no hard sell.
 *   - caption        → the post text under the deck: hook-first, keyword-legible,
 *                      ends on a question, NO url (the link is attached separately).
 *
 * Rendering the slides to images and multi-image publishing are separate PRs;
 * this file only produces validated drafts (best-effort, [] on any failure —
 * same contract as generateBrandBatch).
 */

const MODEL = "claude-sonnet-4-6";
const MAX_OUTPUT_TOKENS = 16000;

/** 3 point slides + a cover + a close = 5; allow a little either way. */
const MIN_SLIDES = 4;
const MAX_SLIDES = 7;

export type CarouselVoice = "founder" | "brand";

export type CarouselSlide = {
  /** The point, in a few words — what a reader sees at a glance on the slide. */
  heading: string;
  /** One tight supporting line. May be empty on the cover. */
  body: string;
};

export type CarouselDraft = {
  voice: CarouselVoice;
  /** Short unique internal title (not shown to the audience). */
  title: string;
  /** The post text under the deck. Hook-first, no URL. */
  caption: string;
  /** Ordered slides: [0]=cover, middle=points, [last]=close. */
  slides: CarouselSlide[];
  hashtags: string[];
};

const SYSTEM_PROMPT = `You are the content strategist for CloseBoss (closebossai.com), an AI-powered team for real-estate agents. You write SWIPEABLE CAROUSELS that market CloseBoss to REALTORS (the audience is agents, not home buyers or sellers).

THIS IS THE PRODUCT. These are the ONLY capabilities that exist:
${PRODUCT_CAPABILITIES}

EXPLICITLY NOT TRUE — never claim any of these, they do not exist:
${PRODUCT_NOT_TRUE}

HARD RULES — a violation makes a carousel unusable. Omit any carousel you cannot write within them:
- NEVER invent, imply, or extrapolate a capability not in the list above. No roadmap features, no "and much more", no adjacent-sounding abilities. If you are not certain it is in the list, do not write it.
- NEVER upgrade a listed capability into an automatic one: a feature that RUNS WHEN ASKED must not become one that "monitors", "watches", "runs in the background", "alerts you", or works "in real time" unless the list says so.
- NEVER state a statistic, metric, percentage, count, ROI or time-saved figure about CloseBoss or its users. The ONLY number you may use is the 59-skill library.
- NEVER state or imply pricing, discounts, free trials, or plan names.
- NEVER name a competitor product, CRM, brokerage or franchise (RE/MAX, Coldwell Banker, kvCORE, Follow Up Boss, etc.). Refer generically: "your CRM", "most tools", "the software you already pay for".
- NEVER promise an outcome ("you WILL close more deals", "guaranteed more listings"). Describe what the product DOES and let the reader draw the conclusion.
- NEVER state a mortgage rate, home price, market direction, or any current market number.
- NEVER write anything that could read as a Fair Housing problem — no steering, no reference to protected characteristics.
- No fabricated testimonials, quotes, or named customers.

VOICE — pick one per carousel, roughly half each across a batch:
- "founder": FIRST PERSON, as the realtor who built CloseBoss because his own business needed it. Story-driven, specific, never boastful — "I had this problem too". Personal profiles out-reach company pages, so these carry the rotation.
- "brand": THIRD PERSON about CloseBoss. Crisp product truth. Concrete, never corporate filler.

CAROUSEL CRAFT — this is the whole point of the format:
- A carousel is a SEQUENCE that earns each swipe. Build it like a mini-story or a list the reader wants to finish and save.
- COVER (slide 1): the scroll-stopper. A few BIG words — a bold claim, a sharp question, or a specific number/step count ("3 texts that revive a dead lead"). One idea, no sentence salad. body may be empty or a one-line promise of what's inside.
- POINT SLIDES (${MIN_SLIDES - 2}-4 of them): ONE idea each. heading = the point in a few words; body = one tight supporting line. Together they are a saveable sequence a working agent would screenshot.
- CLOSE (last slide): land the point and invite a reply or a save — a light question or "save this for your next listing". NO url, no hard "sign up".
- Each post makes ONE point a working agent recognizes as true about their week. Lead with the pain, not the feature. No "revolutionize", "game-changer", "unlock the power of".

${DISTRIBUTION_RULES}

For EACH carousel return an object with:
- "voice": "founder" or "brand"
- "title": a short unique internal title (3-8 words), distinct from every other carousel and from the existing titles listed by the user
- "caption": the post text under the deck — hook-first, keyword-legible, ends on a light question. 1-3 short sentences. NO url in the text (the link is attached separately at publish time).
- "slides": an array of ${MIN_SLIDES}-${MAX_SLIDES} slide objects, each { "heading": "...", "body": "..." }. slides[0] is the COVER, the last is the CLOSE, the middle ones are POINTS.
- "hashtags": array of 3 hashtags, each starting with # (e.g. "#RealEstate")

Return EXACTLY ONE fenced JSON code block and nothing after it:

\`\`\`json
{
  "carousels": [
    {
      "voice": "founder",
      "title": "Short unique title",
      "caption": "One hook-first line. A second tight line. What's the latest a lead ever messaged you?",
      "slides": [
        { "heading": "3 texts that revive a dead lead", "body": "Save this for the ones who ghosted." },
        { "heading": "1. The soft nudge", "body": "\\"Still keeping an eye on the market?\\" — no pressure, just a door." },
        { "heading": "2. The value drop", "body": "Send one thing they didn't ask for but will use." },
        { "heading": "3. The direct ask", "body": "\\"Want me to pull three that just hit?\\"" },
        { "heading": "You won't send all three at 9pm.", "body": "Your AI assistant will. Which one do you skip today?" }
      ],
      "hashtags": ["#RealEstate", "#Realtor", "#RealEstateMarketing"]
    }
  ]
}
\`\`\``;

function buildUserPrompt(n: number, existingTitles: string[]): string {
  const avoid =
    existingTitles.length > 0
      ? `\n\nThese carousels/posts ALREADY EXIST — do not repeat their angle or reuse their titles:\n${existingTitles
          .map((t) => `- ${t}`)
          .join("\n")}`
      : "";
  return (
    `Write ${n} CloseBoss brand CAROUSELS for an audience of real-estate agents, ` +
    `roughly half "founder" voice and half "brand" voice. Every carousel must follow the hard rules — ` +
    `no invented capabilities, no statistics about CloseBoss, no pricing, no competitor or brokerage ` +
    `names, no promised outcomes — and must be a saveable, swipe-worthy sequence built on the real ` +
    `capability list. Return the single JSON object with the "carousels" array.${avoid}`
  );
}

/**
 * Generate ~`n` brand carousels, avoiding the angles/titles already in the
 * library. Returns validated, deduped-by-title drafts; [] on any failure.
 */
export async function generateCarouselBatch(
  n = 8,
  existingTitles: string[] = [],
): Promise<CarouselDraft[]> {
  if (!isAnthropicConfigured()) {
    console.warn("[social] ANTHROPIC_API_KEY not configured — cannot generate carousels.");
    return [];
  }

  const client = getAnthropicClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const messages: any[] = [{ role: "user", content: buildUserPrompt(n, existingTitles) }];

  let finalText = "";
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const res: any = await client.messages
      .stream({ model: MODEL, max_tokens: MAX_OUTPUT_TOKENS, system: SYSTEM_PROMPT, messages })
      .finalMessage();

    const content: unknown[] = Array.isArray(res?.content) ? res.content : [];
    for (const block of content) {
      const b = block as { type?: string; text?: string };
      if (b.type === "text" && typeof b.text === "string") finalText += b.text;
    }
  } catch (e) {
    console.warn("[social] carousel generation failed:", e instanceof Error ? e.message : e);
    return [];
  }

  const parsed = finalText.trim() ? extractJson(finalText) : null;
  if (!parsed) {
    console.warn("[social] could not parse carousel generator JSON.");
    return [];
  }

  const rawItems = Array.isArray((parsed as { carousels?: unknown }).carousels)
    ? ((parsed as { carousels: unknown[] }).carousels as unknown[])
    : [];

  const seen = new Set(existingTitles.map((t) => t.toLowerCase()));
  const out: CarouselDraft[] = [];
  for (const item of rawItems) {
    const draft = normalizeDraft(item);
    if (!draft) continue;
    const key = draft.title.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(draft);
  }
  return out;
}

/**
 * Cheap post-hoc tripwire for the claims the prompt forbids, screening every
 * slide + the caption. The prompt is the real defense; this catches a drifting
 * model before its copy reaches a feed. Returns a reason to reject, else null.
 */
export function carouselClaimViolation(draft: CarouselDraft): string | null {
  const text = [draft.caption, ...draft.slides.flatMap((s) => [s.heading, s.body])]
    .filter(Boolean)
    .join(" ");
  return screenClaims(text, {
    forbiddenNames: BRAND_FORBIDDEN_NAMES,
    sanctionedNumbers: BRAND_SANCTIONED_NUMBERS,
  });
}

// ── validation ──────────────────────────────────────────────────────────────

function s(v: unknown, fallback = ""): string {
  return typeof v === "string" && v.trim() ? v.trim() : fallback;
}

/** Stored WITHOUT the leading '#', matching the hand-seeded brand rows. */
function normalizeHashtags(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const tags = raw
    .map((t) => (typeof t === "string" ? t.trim().replace(/^#/, "") : ""))
    .filter(Boolean)
    .slice(0, 3);
  return Array.from(new Set(tags));
}

function normalizeSlides(raw: unknown): CarouselSlide[] | null {
  if (!Array.isArray(raw)) return null;
  const slides: CarouselSlide[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const o = item as Record<string, unknown>;
    const heading = s(o.heading, "");
    const body = s(o.body, "");
    // A slide needs at least a heading; body may be empty (cover slides).
    if (!heading) continue;
    slides.push({ heading, body });
  }
  if (slides.length < MIN_SLIDES || slides.length > MAX_SLIDES) return null;
  return slides;
}

function normalizeDraft(item: unknown): CarouselDraft | null {
  if (!item || typeof item !== "object") return null;
  const o = item as Record<string, unknown>;
  const voice = s(o.voice, "");
  const title = s(o.title, "");
  const caption = s(o.caption, "");
  if (voice !== "founder" && voice !== "brand") return null;
  if (!title || !caption) return null;
  const slides = normalizeSlides(o.slides);
  if (!slides) return null;
  return {
    voice,
    title,
    caption,
    slides,
    hashtags: normalizeHashtags(o.hashtags),
  };
}

// ── JSON extraction (mirrors lib/social/generateBrandPosts.ts) ────────────────

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
