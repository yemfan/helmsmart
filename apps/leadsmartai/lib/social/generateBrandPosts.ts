import "server-only";

import { screenClaims } from "@helm/dna-marketing";

import { getAnthropicClient, isAnthropicConfigured } from "@/lib/anthropic";
import {
  BRAND_FORBIDDEN_NAMES,
  BRAND_SANCTIONED_NUMBERS,
  PRODUCT_CAPABILITIES,
  PRODUCT_NOT_TRUE,
} from "@/lib/social/productFacts";

/**
 * Brand-voice social-content generator — the AGENT-OWNED half of the library.
 *
 * Sibling of generateEvergreen.ts, but a different audience and a different
 * failure mode. generateEvergreen writes consumer education for an agent's
 * CLIENTS; this writes CloseBoss's own marketing, aimed at REALTORS, and lands
 * in social_content_library owned by the brand agent (agent_id set, category
 * 'brand') so it can never be recommended to a real agent.
 *
 * THE RISK THAT SHAPES THIS PROMPT: a model asked to write marketing copy for a
 * product will cheerfully invent features, metrics and guarantees. The evergreen
 * generator's hard rules are about not asserting a stale NUMBER; these are about
 * not asserting a capability we don't ship. So the prompt carries an explicit
 * capability inventory and forbids everything outside it. Anything the model is
 * unsure about, it omits — a thin library is recoverable, a false product claim
 * on the brand's own feed is not.
 *
 * Two voices, matching the hand-written seed set: founder first-person (the
 * realtor who built it — outperforms brand copy on a personal feed) and brand
 * third-person. Roughly half each.
 */

const MODEL = "claude-sonnet-4-6";
const MAX_OUTPUT_TOKENS = 16000;

export type BrandVoice = "founder" | "brand";

export type BrandPostDraft = {
  voice: BrandVoice;
  title: string;
  hook: string;
  body: string;
  hashtags: string[];
  image_prompt: string;
  cta: string;
};

const SYSTEM_PROMPT = `You are the content strategist for CloseBoss (closebossai.com), an AI-powered team for real-estate agents. You write social posts that market CloseBoss to REALTORS (the audience is agents, not home buyers or sellers).

THIS IS THE PRODUCT. These are the ONLY capabilities that exist:
${PRODUCT_CAPABILITIES}

EXPLICITLY NOT TRUE — never claim any of these, they do not exist:
${PRODUCT_NOT_TRUE}

HARD RULES — a violation makes a post unusable. Omit any post you cannot write within them:
- NEVER invent, imply, or extrapolate a capability not in the list above. No roadmap features, no "and much more", no adjacent-sounding abilities. If you are not certain it is in the list, do not write the post.
- NEVER upgrade a listed capability into an automatic one. This is the most common way to write something false: a feature that RUNS WHEN ASKED becomes, in a sentence or two, one that "monitors", "watches", "runs in the background", "alerts you", or works "in real time". If the list does not say it happens on its own, it does not happen on its own.
- NEVER state a statistic, metric, percentage, count, ROI or time-saved figure about CloseBoss or its users ("agents close 3x more", "saves 10 hours a week", "used by 500 agents"). We have no such data and inventing it is a false claim. The ONLY number you may use is the 59-skill library.
- NEVER state or imply pricing, discounts, free trials, or plan names. Pricing is not your subject.
- NEVER name a competitor product, CRM, brokerage or franchise (RE/MAX, Coldwell Banker, kvCORE, Follow Up Boss, etc.). Refer generically: "your CRM", "most tools", "the software you already pay for". Naming a real brand creates trademark and endorsement problems.
- NEVER promise an outcome ("you WILL close more deals", "guaranteed more listings"). Describe what the product DOES and let the reader draw the conclusion.
- NEVER state a mortgage rate, home price, market direction, or any current market number.
- NEVER write anything that could read as a Fair Housing problem — no steering, no reference to the protected characteristics of buyers or neighborhoods.
- No fabricated testimonials, quotes, or named customers.

VOICE — write roughly half of each:
- "founder": FIRST PERSON, as the realtor who built CloseBoss because his own business needed it. Story-driven and specific: a moment, a frustration, what he did about it. Personal profiles out-reach company pages, so these carry the rotation. Never boastful; the tone is "I had this problem too".
- "brand": THIRD PERSON about CloseBoss. Crisp product truth. Still concrete, never corporate filler.

QUALITY BAR: each post makes ONE point a working agent would recognize as true about their own week. Lead with the pain, not the feature. No "revolutionize", "game-changer", "unlock the power of", "in today's fast-paced market". If a post could be about any software company, throw it out.

For EACH post return an object with:
- "voice": "founder" or "brand"
- "title": a short unique internal title (3-8 words), distinct from every other post and from the existing titles listed by the user
- "hook": the scroll-stopping FIRST LINE (one punchy sentence)
- "body": 2-5 sentences — the actual post
- "hashtags": array of 3 hashtags, each starting with # (e.g. "#RealEstate")
- "image_prompt": a one-line suggestion for an accompanying image
- "cta": a short closing line, usually the site (e.g. "closebossai.com")

Return EXACTLY ONE fenced JSON code block and nothing after it:

\`\`\`json
{
  "posts": [
    {
      "voice": "founder",
      "title": "Short unique title",
      "hook": "One punchy first line.",
      "body": "2-5 sentences.",
      "hashtags": ["#RealEstate", "#Realtor", "#AI"],
      "image_prompt": "A realtor checking their phone between showings.",
      "cta": "closebossai.com"
    }
  ]
}
\`\`\``;

function buildUserPrompt(n: number, existingTitles: string[]): string {
  const avoid =
    existingTitles.length > 0
      ? `\n\nThese posts ALREADY EXIST — do not repeat their angle, and do not reuse their titles:\n${existingTitles
          .map((t) => `- ${t}`)
          .join("\n")}`
      : "";
  return (
    `Write ${n} CloseBoss brand social posts for an audience of real-estate agents, ` +
    `roughly half "founder" voice and half "brand" voice. Every post must follow the hard rules — ` +
    `no invented capabilities, no statistics about CloseBoss, no pricing, no competitor or brokerage ` +
    `names, no promised outcomes. Each post must make one concrete point drawn from the real ` +
    `capability list. Return the single JSON object with the "posts" array.${avoid}`
  );
}

/**
 * Generate ~`n` brand posts, avoiding the angles/titles already in the library.
 * Returns validated, deduped-by-title drafts; [] on any failure (best-effort,
 * same contract as generateEvergreenBatch).
 */
export async function generateBrandBatch(
  n = 20,
  existingTitles: string[] = [],
): Promise<BrandPostDraft[]> {
  if (!isAnthropicConfigured()) {
    console.warn("[social] ANTHROPIC_API_KEY not configured — cannot generate brand batch.");
    return [];
  }

  const client = getAnthropicClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const messages: any[] = [
    { role: "user", content: buildUserPrompt(n, existingTitles) },
  ];

  let finalText = "";
  try {
    // Stream + finalMessage: same shape as the evergreen/digest generators (a
    // large batch under a plain create() can trip the SDK's non-streaming ceiling).
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
    console.warn("[social] brand generation failed:", e instanceof Error ? e.message : e);
    return [];
  }

  const parsed = finalText.trim() ? extractJson(finalText) : null;
  if (!parsed) {
    console.warn("[social] could not parse brand generator JSON.");
    return [];
  }

  const rawPosts = Array.isArray((parsed as { posts?: unknown }).posts)
    ? ((parsed as { posts: unknown[] }).posts as unknown[])
    : [];

  const seen = new Set(existingTitles.map((t) => t.toLowerCase()));
  const out: BrandPostDraft[] = [];
  for (const item of rawPosts) {
    const post = normalizeDraft(item);
    if (!post) continue;
    const key = post.title.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(post);
  }
  return out;
}

/**
 * Cheap post-hoc tripwire for the claims the prompt forbids. The prompt is the
 * real defense; this catches a drifting model before its copy reaches a feed.
 * Returns a reason when the draft should be rejected, else null.
 */
export function brandClaimViolation(post: BrandPostDraft): string | null {
  // Delegates to the shared screen so there is exactly ONE implementation of
  // these rules — this used to be a second copy, and a second copy of a safety
  // check is a copy that will eventually disagree with the first.
  return screenClaims(`${post.hook} ${post.body} ${post.cta}`, {
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

function normalizeDraft(item: unknown): BrandPostDraft | null {
  if (!item || typeof item !== "object") return null;
  const o = item as Record<string, unknown>;
  const voice = s(o.voice, "");
  const title = s(o.title, "");
  const hook = s(o.hook, "");
  const body = s(o.body, "");
  if (voice !== "founder" && voice !== "brand") return null;
  if (!title || !hook || !body) return null;
  return {
    voice,
    title,
    hook,
    body,
    hashtags: normalizeHashtags(o.hashtags),
    image_prompt: s(o.image_prompt, ""),
    cta: s(o.cta, "closebossai.com"),
  };
}

// ── JSON extraction (mirrors lib/social/generateEvergreen.ts) ─────────────────

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
