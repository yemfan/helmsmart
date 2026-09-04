import "server-only";

import { isAnthropicConfigured } from "@/lib/anthropic";
import { supabaseAdmin } from "@/lib/supabase/admin";
import type { TransactionRow } from "@/lib/transactions/types";
import { gatherDealReviewSnapshot } from "./gatherSnapshot";
import {
  buildFallbackReview,
  generateDealReview,
} from "./generateReview";
import type { DealReview } from "./types";
import { agentUiLocale } from "@/lib/i18n/agentLocale";

/**
 * Orchestrator for AI deal reviews.
 *
 *   * `getDealReview` — returns the cached review if present; generates
 *     + caches on first call. Closed deals don't change, so the cache
 *     effectively lives forever.
 *   * `regenerateDealReview` — ignores the cache, fires Claude again,
 *     overwrites. Used when the agent explicitly taps "Regenerate."
 *
 * Only valid for CLOSED transactions — the snapshot math assumes
 * closing_date_actual is populated. API route enforces this.
 */

export type DealReviewResult = {
  review: DealReview;
  fromCache: boolean;
  usedFallback: boolean;
  aiConfigured: boolean;
};

export async function getDealReview(
  agentId: string,
  transactionId: string,
): Promise<DealReviewResult | null> {
  const tx = await loadOwnedTransaction(agentId, transactionId);
  if (!tx) return null;
  if (tx.status !== "closed") {
    throw new Error("Deal reviews are only available on closed transactions.");
  }

  const cached = await readCache(transactionId);
  if (cached) {
    return {
      review: cached,
      fromCache: true,
      usedFallback: false,
      aiConfigured: isAnthropicConfigured(),
    };
  }
  return runGenerate(tx, agentId);
}

export async function regenerateDealReview(
  agentId: string,
  transactionId: string,
): Promise<DealReviewResult | null> {
  const tx = await loadOwnedTransaction(agentId, transactionId);
  if (!tx) return null;
  if (tx.status !== "closed") {
    throw new Error("Deal reviews are only available on closed transactions.");
  }
  return runGenerate(tx, agentId);
}

async function runGenerate(
  tx: TransactionRow,
  agentId: string,
): Promise<DealReviewResult> {
  const snapshot = await gatherDealReviewSnapshot(tx);
  const aiConfigured = isAnthropicConfigured();

  let review: DealReview;
  let usedFallback = false;
  if (aiConfigured) {
    try {
      review = await generateDealReview(snapshot, await agentUiLocale(agentId));
    } catch (err) {
      console.warn(
        `[deal-review] Claude failed for tx=${tx.id} — using fallback:`,
        err instanceof Error ? err.message : err,
      );
      review = buildFallbackReview(snapshot);
      usedFallback = true;
    }
  } else {
    review = buildFallbackReview(snapshot);
    usedFallback = true;
  }

  try {
    await supabaseAdmin.from("transaction_reviews").upsert(
      {
        transaction_id: tx.id,
        agent_id: agentId,
        payload: review,
        generated_at: review.generatedAtIso,
      },
      { onConflict: "transaction_id" },
    );
  } catch (err) {
    // Cache-write failure shouldn't block returning the review.
    console.error(
      "[deal-review] cache write failed:",
      err instanceof Error ? err.message : err,
    );
  }

  return { review, fromCache: false, usedFallback, aiConfigured };
}

async function readCache(transactionId: string): Promise<DealReview | null> {
  try {
    const { data, error } = await supabaseAdmin
      .from("transaction_reviews")
      .select("payload, generated_at")
      .eq("transaction_id", transactionId)
      .maybeSingle();
    if (error) {
      console.warn(
        "[deal-review] cache read:",
        (error as { message?: string }).message ?? error,
      );
      return null;
    }
    if (!data) return null;
    const row = data as { payload: DealReview; generated_at: string };
    if (!row.payload) return null;
    return {
      ...row.payload,
      generatedAtIso: row.payload.generatedAtIso ?? row.generated_at,
    };
  } catch {
    return null;
  }
}

async function loadOwnedTransaction(
  agentId: string,
  transactionId: string,
): Promise<TransactionRow | null> {
  const { data } = await supabaseAdmin
    .from("transactions")
    .select("*")
    .eq("id", transactionId)
    .eq("agent_id", agentId)
    .maybeSingle();
  return (data as TransactionRow | null) ?? null;
}
