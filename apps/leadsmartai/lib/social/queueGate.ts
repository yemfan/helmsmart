import "server-only";

import { reviewOutboundPost } from "./reviewClaims";

export type QueueStatus = "scheduled" | "awaiting_approval";

/**
 * Autopilot queue gate for brand social posts (ads, carousels, reels), matching
 * the recommendation stream's mode semantics so "assisted" behaves consistently
 * everywhere:
 *
 *   - auto      → publish on the next tick, NO content review.
 *   - assisted  → the safe hands-off mode: deterministic content (hardcoded ad
 *                 presets, real warehouse data) publishes as-is; AI-written
 *                 content is claim-checked and only CLEAN posts publish — a
 *                 flagged post is held for approval.
 *   - ask / review / anything unrecognized → hold for approval (fail closed).
 *
 * reviewOutboundPost itself fails closed (returns "flagged" on empty caption,
 * missing API key, or any error), so a broken checker holds posts rather than
 * releasing them.
 */
export async function queueStatusForPost(
  mode: string | null | undefined,
  caption: string,
  opts: { aiGenerated: boolean },
): Promise<QueueStatus> {
  if (mode === "auto") return "scheduled";
  if (mode !== "assisted") return "awaiting_approval";
  if (!opts.aiGenerated) return "scheduled";
  const review = await reviewOutboundPost(caption, "brand");
  return review.verdict === "clean" ? "scheduled" : "awaiting_approval";
}
