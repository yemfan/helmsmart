// Deterministic screen for claims a business must not make about itself.
//
// Pure regex, no I/O. This is the cheap half of the two-part gate; the LLM
// reviewer (claim-review.ts) is the other. They are kept SEPARATE because
// measurement showed they fail in opposite directions:
//   - the model catches semantic fabrication (a feature described as automatic
//     when it only runs on request) and is unbothered by exact strings
//   - the regex catches exact string classes (competitor names, prices, "3x
//     more") and is blind to meaning
// Neither is a superset of the other, so both run and either can veto.
//
// The RULES here are industry-agnostic. The NAMES are not — which competitors
// exist depends entirely on the vertical — so they arrive as config.

export type ClaimScreenConfig = {
  /**
   * Brand / competitor / franchise names that must never appear. Naming a real
   * brand in marketing copy creates trademark and implied-endorsement problems.
   * Industry-specific, so the vertical supplies it.
   */
  forbiddenNames?: RegExp;
  /**
   * Numbers that ARE legitimate for this business (e.g. a real published
   * feature count). Everything else that looks like a performance metric is
   * treated as invented, because it usually is.
   */
  sanctionedNumbers?: readonly string[];
};

/**
 * Returns a reason to reject, or null if the text passes.
 *
 * Every rule below earned its place by catching something real in production
 * copy — see the comments.
 */
export function screenClaims(text: string, config: ClaimScreenConfig = {}): string | null {
  // Competitor / brokerage names.
  if (config.forbiddenNames) {
    const hit = config.forbiddenNames.exec(text);
    if (hit) return `names a real brand: "${hit[0]}"`;
  }

  // Invented performance statistics. A business with no published metrics
  // asserting "3x more deals" or "saves 10 hours a week" is fabricating.
  const allowed = new Set(config.sanctionedNumbers ?? []);
  const stat = /\b(\d+(?:\.\d+)?)\s*(x\b|%|percent|hours?\b|hrs?\b|minutes?\b)/i.exec(text);
  if (stat && !allowed.has(stat[1])) {
    return `asserts an unsupported metric: "${stat[0]}"`;
  }

  // Pricing. Almost always wrong in evergreen copy, and wrong in a way that
  // costs money.
  if (/\$\s?\d|\bper month\b|\bfree trial\b|\bpricing\b/i.test(text)) {
    return "references pricing";
  }

  // Outcome guarantees.
  if (/\bguarantee|\bwill (close|earn|make|double|triple)\b/i.test(text)) {
    return "promises an outcome";
  }

  // AUTONOMY INFLATION — the single most common way AI-written product copy
  // becomes false. A feature that runs WHEN ASKED becomes, within a sentence,
  // one that "monitors", "watches" or "alerts you". A real generated post
  // turned saved searches into "a live search running on their behalf".
  // Scoped to search/market/alert language so genuinely automatic features
  // (an always-on receptionist, an auto-replying texter) still pass.
  const autonomy =
    /\b(live search|running on their behalf|watch(?:es|ing)? the market|monitors?|real.?time|listing alerts?|alerts? you when|notif(?:y|ies|ication)s? (?:you )?when)\b/i.exec(
      text,
    );
  if (autonomy) return `claims automation that isn't shipped: "${autonomy[0]}"`;

  // INTEGRATION INFLATION — implying separate tools hand work to each other
  // automatically. Another real one: "a lead captured by the receptionist
  // moves directly into the sales cadence... everything is already connected".
  const pipeline =
    /\b(moves? (?:directly )?into the [a-z ]*cadence|already connected|flows? (?:automatically|straight) (?:in)?to|hands? off to)\b/i.exec(
      text,
    );
  if (pipeline) return `overclaims cross-product integration: "${pipeline[0]}"`;

  return null;
}
