import "server-only";

import {
  buildClaimReviewPrompt,
  combineClaimReviews,
  parseClaimReview,
  screenClaims,
  CLAIM_REVIEW_SAMPLES,
  CLAIM_REVIEW_TEMPERATURE,
  type ClaimIssue,
  type ClaimReview,
} from "@helm/dna-marketing";

import { getAnthropicClient, isAnthropicConfigured } from "@/lib/anthropic";
import {
  BRAND_FORBIDDEN_NAMES,
  BRAND_SANCTIONED_NUMBERS,
  PRODUCT_CAPABILITIES,
  PRODUCT_NOT_TRUE,
} from "@/lib/social/productFacts";

/**
 * CloseBoss's adapter over the shared claim-check engine.
 *
 * The JUDGEMENT lives in @helm/dna-marketing — prompt, parsing, the any-veto
 * combine, and the settings that were derived by measurement rather than taste.
 * This file supplies the three things that are genuinely ours: our product
 * facts, our competitor list, and our Anthropic client.
 *
 * That split is the point. HelmSmart runs the identical gate against its own
 * facts without inheriting a single real-estate assumption.
 */

export type { ClaimIssue, ClaimReview };

const MODEL = "claude-sonnet-4-6";
const MAX_OUTPUT_TOKENS = 1200;

const FACTS = { capabilities: PRODUCT_CAPABILITIES, notTrue: PRODUCT_NOT_TRUE };

/** What kind of post is being checked — the rules differ completely. */
export type PostKind = "brand" | "timely";

/** One independent read. Fails closed on every error path. */
async function readOnce(caption: string, kind: PostKind): Promise<ClaimReview> {
  const { system, user } = buildClaimReviewPrompt(
    caption,
    FACTS,
    kind === "timely" ? "news" : "product",
  );

  let text = "";
  try {
    const client = getAnthropicClient();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const res: any = await client.messages.create({
      model: MODEL,
      max_tokens: MAX_OUTPUT_TOKENS,
      temperature: CLAIM_REVIEW_TEMPERATURE,
      system,
      messages: [{ role: "user", content: user }],
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
  return parseClaimReview(text);
}

/**
 * The AI half of the gate, sampled and combined. Never throws — every failure
 * path returns 'flagged' so a broken checker holds posts rather than releasing
 * them.
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

  const reads = await Promise.all(
    Array.from({ length: CLAIM_REVIEW_SAMPLES }, () => readOnce(caption, kind)),
  );
  return combineClaimReviews(reads);
}

/**
 * The FULL gate: deterministic screen AND the model's read, either of which can
 * veto.
 *
 * Both run because measurement showed they fail in OPPOSITE directions — the
 * model catches semantic fabrication but once waved through a competitor's
 * name; the regex catches exact strings and is blind to meaning. Neither is a
 * superset of the other.
 *
 * The screen is skipped for 'timely' posts: those are cited news, where a
 * figure is the point rather than an invented claim. Judging news by product
 * rules held a legitimate post for "$30,000 grant" = pricing, and a flag that
 * is usually wrong teaches people to ignore flags.
 */
export async function reviewOutboundPost(
  caption: string,
  kind: PostKind = "brand",
): Promise<ClaimReview> {
  if (kind === "brand") {
    const rule = screenClaims(caption, {
      forbiddenNames: BRAND_FORBIDDEN_NAMES,
      sanctionedNumbers: BRAND_SANCTIONED_NUMBERS,
    });
    if (rule) {
      // A deterministic hit is certain — no reason to spend model calls
      // confirming what a regex already proved.
      return { verdict: "flagged", issues: [{ quote: caption.slice(0, 120), why: rule }] };
    }
  }
  return reviewBrandClaims(caption, kind);
}
