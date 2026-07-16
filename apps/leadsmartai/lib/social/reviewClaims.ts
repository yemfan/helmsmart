import "server-only";

import { getAnthropicClient, isAnthropicConfigured } from "@/lib/anthropic";
import { brandClaimViolation } from "@/lib/social/generateBrandPosts";
import { PRODUCT_CAPABILITIES, PRODUCT_NOT_TRUE } from "@/lib/social/productFacts";

/**
 * The Boss Assistant's fact-check on a post before it publishes.
 *
 * This exists because the brand's posts are AI-written marketing about our own
 * product, and an LLM writing product copy invents features. Two real drafts
 * ("a live search running on their behalf"; "everything is already connected")
 * reached the content library before a human caught them.
 *
 * Design constraints, all of them load-bearing:
 *
 *  - ADVERSARIAL, not evaluative. The job is to REFUTE the post against the
 *    capability list, not to rate it. "Is this good copy?" is not the question;
 *    "does this assert something we don't ship?" is.
 *  - INDEPENDENT of the writer. It sees the post and the facts — never the
 *    generator's prompt, voice guidance, or reasoning. Sharing the fact list is
 *    correct (it's ground truth); sharing the writer's rationalisation is not.
 *  - FAILS CLOSED. Unparseable output, an API error, no key, low confidence —
 *    every one of those returns `flagged`. A checker that returns "clean" when
 *    it is actually broken is worse than no checker, because it launders
 *    unreviewed copy as reviewed.
 *
 * A `clean` verdict is NOT a promise the post is true; it means nothing in it
 * contradicts the known facts. That's why 'assisted' mode still leaves the post
 * visible in the queue with a cancel window rather than firing it immediately.
 */

const MODEL = "claude-sonnet-4-6";
const MAX_OUTPUT_TOKENS = 1200;

/**
 * A fact-check is a judgement, not a generation — we want the same post to get
 * the same verdict every time. The API defaults to temperature 1.0, which is
 * wrong for this: measured at the default, a KNOWN false claim ("RealtyBoss
 * answers portal leads instantly" — there is no portal integration) came back
 * clean on 1 of 30 runs.
 */
const TEMPERATURE = 0;

/**
 * How many independent reads decide a post, and how they combine: ANY flag wins.
 *
 * Temperature 0 narrows the distribution but does not make an LLM deterministic,
 * and one sample of a stochastic judge is a coin flip you only roll once. The
 * costs here are wildly asymmetric — a miss publishes a false claim about our
 * own product to our own feed; a false alarm costs a human ten seconds in the
 * queue — so the tie-break is always "hold it".
 *
 * Any-veto across 3 reads turns a ~3% per-read miss into ~0.003%, for 3 cheap
 * calls on ~7 posts a week. That trade is not close.
 */
const REVIEW_SAMPLES = 3;

export type ClaimIssue = {
  /** The exact words from the post that make the unsupported claim. */
  quote: string;
  /** Why it isn't supported by the capability list. */
  why: string;
};

export type ClaimReview = {
  verdict: "clean" | "flagged";
  issues: ClaimIssue[];
  /** Set when the check could not actually run — always paired with 'flagged'. */
  error?: string;
};

const SYSTEM_PROMPT = `You are a fact-checker for RealtyBoss's own marketing. A post is about to be published to the company's public feed. Your only job is to catch claims the product cannot actually back up.

THE COMPLETE LIST OF WHAT REALTYBOSS DOES. Nothing outside this list exists:
${PRODUCT_CAPABILITIES}

EXPLICITLY FALSE — these do not exist, flag any post that claims them:
${PRODUCT_NOT_TRUE}

HOW TO JUDGE:
- Try to REFUTE the post. You are not rating the writing, the tone, or whether it is persuasive. Only: does it assert something the list does not support?
- The most common failure is AUTONOMY INFLATION: a feature that runs WHEN ASKED is described as one that "monitors", "watches", "runs in the background", "alerts you", or works "in real time". If the list does not say it happens on its own, claiming it does is FALSE.
- The second most common is INTEGRATION INFLATION: implying the assistants hand work to each other automatically, or that we integrate with systems we do not.
- Also flag: any statistic about RealtyBoss or its users, pricing, competitor or brokerage names, and guaranteed outcomes.
- Subjective claims and opinions about the INDUSTRY are fine ("most agents don't have time to follow up", "a missed call is a missed commission"). Judge product claims only.
- Aspirational framing about the writer's own past ("I used to lose leads", "I built this because…") is fine — it is not a product claim.
- WHEN IN DOUBT, FLAG IT. A false claim on our own feed is far more expensive than a human spending ten seconds approving a good post. Do not give the benefit of the doubt.

Return EXACTLY ONE fenced JSON code block and nothing after it:

\`\`\`json
{
  "verdict": "clean" | "flagged",
  "issues": [
    { "quote": "the exact words that overclaim", "why": "what the list actually says" }
  ]
}
\`\`\`

"issues" must be empty when the verdict is clean, and non-empty when flagged.`;

/**
 * Check one post. Never throws — every failure path returns a 'flagged' verdict
 * so a broken checker holds posts rather than releasing them.
 */
export async function reviewBrandClaims(
  caption: string,
  kind: PostKind = "brand",
): Promise<ClaimReview> {
  if (!caption.trim()) {
    return { verdict: "flagged", issues: [], error: "empty caption" };
  }
  if (!isAnthropicConfigured()) {
    return { verdict: "flagged", issues: [], error: "ANTHROPIC_API_KEY not configured" };
  }

  let text = "";
  try {
    const client = getAnthropicClient();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const res: any = await client.messages.create({
      model: MODEL,
      max_tokens: MAX_OUTPUT_TOKENS,
      temperature: TEMPERATURE,
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: "user",
          content:
            (kind === "timely"
              ? `This post is CITED MARKET NEWS composed from a sourced newsletter digest — it is not marketing copy about RealtyBoss. Specific figures (grant amounts, rates, prices, programme names, dates) are the POINT of this kind of post and are NOT violations; they came from a cited source, not from you. Judge ONLY whether it claims something about RealtyBoss the product that the list doesn't support. If the post doesn't mention RealtyBoss at all, it is clean.\n\n`
              : ``) +
            `Fact-check this post against the list. Return the JSON block.\n\n---\n${caption.trim()}\n---`,
        },
      ],
    });
    for (const block of (Array.isArray(res?.content) ? res.content : []) as unknown[]) {
      const b = block as { type?: string; text?: string };
      if (b.type === "text" && typeof b.text === "string") text += b.text;
    }
  } catch (e) {
    return {
      verdict: "flagged",
      issues: [],
      error: `check failed: ${e instanceof Error ? e.message : String(e)}`,
    };
  }

  const parsed = extractJson(text);
  if (!parsed) {
    return { verdict: "flagged", issues: [], error: "unparseable checker output" };
  }

  const issues = normalizeIssues((parsed as { issues?: unknown }).issues);
  const verdict = (parsed as { verdict?: unknown }).verdict;

  // Only an explicit "clean" WITH no issues is allowed through. A model that
  // says "clean" while listing problems is contradicting itself — hold the post.
  if (verdict === "clean" && issues.length === 0) return { verdict: "clean", issues: [] };
  if (verdict === "flagged") return { verdict: "flagged", issues };
  return {
    verdict: "flagged",
    issues,
    error: typeof verdict === "string" ? `unexpected verdict '${verdict}'` : "missing verdict",
  };
}

/** What kind of post is being checked — the rules differ completely. */
export type PostKind = "brand" | "timely";

/**
 * The full gate: the deterministic screen AND the Boss's read, both of which
 * must clear for a post to publish unattended.
 *
 * They are kept together because measurement showed they fail in OPPOSITE
 * directions, and either alone has a hole:
 *   - the model caught every semantic fabrication (autonomy inflation,
 *     invented integrations) but waved through a competitor's name;
 *   - the regex catches exact string classes (competitor names, pricing,
 *     "3x more deals") and is blind to meaning.
 * Neither is a superset of the other, so both run and either can veto.
 *
 * `kind` matters more than it looks. The rules above are written for BRAND copy
 * — marketing about our own product, where a dollar figure is almost always an
 * invented claim. A TIMELY post is the opposite: it is cited market news built
 * from the newsletter digest's own sourced copy, where specific figures are the
 * entire point. Judging news by the brand rules flags a legitimate post nearly
 * every week ("Up to $30,000 for first-time buyers" reads as "references
 * pricing"), and a flag that is usually wrong is worse than no flag at all —
 * it teaches the reader to click through warnings without reading them.
 */
export async function reviewOutboundPost(
  caption: string,
  kind: PostKind = "brand",
): Promise<ClaimReview> {
  if (kind === "brand") {
    const rule = brandClaimViolation({
      voice: "brand",
      title: "",
      hook: caption,
      body: "",
      hashtags: [],
      image_prompt: "",
      cta: "",
    });
    if (rule) {
      // A deterministic hit is certain — no reason to spend a model call to
      // confirm what a regex already proved.
      return { verdict: "flagged", issues: [{ quote: caption.slice(0, 120), why: rule }] };
    }
  }

  // Read it REVIEW_SAMPLES times and let any one of them veto. See the constant
  // for why: a single read of a stochastic judge missed a known-false claim on
  // 1 of 30 runs, and the cost of a miss dwarfs the cost of a false alarm.
  const reads = await Promise.all(
    Array.from({ length: REVIEW_SAMPLES }, () => reviewBrandClaims(caption, kind)),
  );

  const objections = reads.filter((r) => r.verdict === "flagged");
  if (objections.length === 0) return { verdict: "clean", issues: [] };

  // Union the reasons, deduped — different reads often quote the same phrase in
  // slightly different words, and a queue card full of near-duplicates is noise.
  const seen = new Set<string>();
  const issues: ClaimIssue[] = [];
  for (const r of objections) {
    for (const i of r.issues) {
      const key = i.quote.slice(0, 40).toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      issues.push(i);
    }
  }
  return {
    verdict: "flagged",
    issues: issues.slice(0, 4),
    // Surface a checker outage (vs a genuine objection) — all reads erroring
    // still holds the post, but the reason should say so.
    error: objections.every((r) => r.error) ? objections[0].error : undefined,
  };
}

function normalizeIssues(raw: unknown): ClaimIssue[] {
  if (!Array.isArray(raw)) return [];
  const out: ClaimIssue[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const o = item as Record<string, unknown>;
    const quote = typeof o.quote === "string" ? o.quote.trim() : "";
    const why = typeof o.why === "string" ? o.why.trim() : "";
    if (quote || why) out.push({ quote, why });
  }
  return out.slice(0, 6);
}

// ── JSON extraction (mirrors the sibling generators) ─────────────────────────

function extractJson(text: string): Record<string, unknown> | null {
  const fenceRe = /```(?:json)?\s*([\s\S]*?)```/gi;
  const fences: string[] = [];
  for (let m = fenceRe.exec(text); m; m = fenceRe.exec(text)) {
    if (m[1] && m[1].includes("{")) fences.push(m[1].trim());
  }
  for (let i = fences.length - 1; i >= 0; i--) {
    const obj = tryParse(fences[i]);
    if (obj) return obj;
  }
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start >= 0 && end > start) return tryParse(text.slice(start, end + 1));
  return null;
}

function tryParse(raw: string): Record<string, unknown> | null {
  try {
    const obj = JSON.parse(raw.replace(/,\s*([}\]])/g, "$1"));
    return obj && typeof obj === "object" && !Array.isArray(obj)
      ? (obj as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}
