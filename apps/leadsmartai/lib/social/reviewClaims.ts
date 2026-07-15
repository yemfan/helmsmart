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
export async function reviewBrandClaims(caption: string): Promise<ClaimReview> {
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
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: "user",
          content: `Fact-check this post against the list. Return the JSON block.\n\n---\n${caption.trim()}\n---`,
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
 */
export async function reviewOutboundPost(caption: string): Promise<ClaimReview> {
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
  return reviewBrandClaims(caption);
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
