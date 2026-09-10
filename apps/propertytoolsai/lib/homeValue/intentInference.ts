/**
 * Infer seller / buyer / investor for recommendations + CloseBoss routing.
 * Combines explicit user choice (optional), behavioral signals, and light property heuristics.
 */

import type { IntentSignals, LikelyIntent, UserIntent } from "@/lib/homeValue/types";
import {
  applyPropertyTypeHeuristics,
  likelyIntentToUserIntent,
  pickLikelyIntentFromScores,
  priceSpreadImpliesValueFocus,
  scoreIntentSignals,
  type IntentScores,
} from "@/lib/homeValue/intentSignals";

export type IntentResolution = {
  /** Best-scoring bucket from signals + heuristics */
  likely: LikelyIntent;
  scores: IntentScores;
  /** Final intent for recommendations + DB (explicit wins when set) */
  intent: UserIntent;
  rationale: string[];
};

export function resolveLikelyIntent(input: {
  explicit?: UserIntent;
  propertyType?: string | null;
  signals?: Partial<IntentSignals>;
  /** (high - low) / point — wide band nudges investor “price vs value” */
  priceSpreadRatio?: number | null;
}): IntentResolution {
  const rationale: string[] = [];

  const spreadFocus = priceSpreadImpliesValueFocus(input.priceSpreadRatio);
  const mergedSignals: Partial<IntentSignals> = {
    ...input.signals,
    homeValueUsed: true,
    priceVsValueFocus: Boolean(input.signals?.priceVsValueFocus) || spreadFocus,
  };
  if (spreadFocus) rationale.push("hint:wide_estimate_spread");

  let scores = scoreIntentSignals(mergedSignals);
  const heur = applyPropertyTypeHeuristics(scores, input.propertyType);
  scores = heur.scores;
  heur.tags.forEach((t) => rationale.push(t));

  let likely = pickLikelyIntentFromScores(scores);
  rationale.push(`scores:seller=${scores.seller},buyer=${scores.buyer},investor=${scores.investor}`);

  if (input.explicit === "buyer" || input.explicit === "investor" || input.explicit === "seller") {
    rationale.push(`explicit:${input.explicit}`);
    return {
      likely,
      scores,
      intent: input.explicit,
      rationale,
    };
  }

  rationale.push(`inferred:${likely}`);
  return {
    likely,
    scores,
    intent: likelyIntentToUserIntent(likely),
    rationale,
  };
}
