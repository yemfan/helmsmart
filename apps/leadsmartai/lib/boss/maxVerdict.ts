/**
 * Verdict shape + the parser, split out because maxReview.ts is `server-only`
 * and so cannot be imported from a test. The model's judgement cannot be
 * unit-tested; what we do with a mangled answer can, and that is the half that
 * decides whether unreviewed text goes out.
 */

export type MaxVerdict = "approve" | "fix" | "escalate" | "reject";

export type MaxReview = {
  verdict: MaxVerdict;
  /** Present only for "fix" — Max's corrected text, ready to send. */
  body?: string;
  /** One line, in the realtor's words, saying what he found. */
  reason: string;
};

/**
 * Turn Max's reply into a verdict, failing toward asking.
 *
 * Everything unrecognised — unparseable JSON, a verdict we don't know, a "fix"
 * with no corrected text — becomes "escalate". The one outcome a broken reply
 * must never produce is "approve": that would send unreviewed text on the
 * strength of a review that did not happen, and the realtor would have stopped
 * reading on the assumption that Max was.
 *
 * Exported for tests. This is the part worth pinning down — the model's judgement
 * cannot be unit-tested, but what we do with a mangled answer can.
 */
export function parseMaxVerdict(rawText: string, channel: "sms" | "email"): MaxReview {
  const unsure = (reason?: string): MaxReview => ({
    verdict: "escalate",
    reason: reason || "Max wasn't sure — your call.",
  });
  try {
    const text = (rawText || "").replace(/```(?:json)?|```/g, "");
    const first = text.indexOf("{");
    const last = text.lastIndexOf("}");
    if (first < 0 || last <= first) return unsure("Max couldn't read this one — over to you.");
    const raw = JSON.parse(text.slice(first, last + 1)) as {
      verdict?: unknown;
      body?: unknown;
      reason?: unknown;
    };
    const verdict = String(raw.verdict ?? "").trim().toLowerCase();
    const reason = (typeof raw.reason === "string" ? raw.reason.trim() : "").slice(0, 300);
    const fixed = typeof raw.body === "string" ? raw.body.trim() : "";

    if (verdict === "approve") return { verdict: "approve", reason: reason || "Reads fine." };
    if (verdict === "reject") return { verdict: "reject", reason: reason || "Max sent it back." };
    if (verdict === "fix" && fixed) {
      return {
        verdict: "fix",
        body: fixed.slice(0, channel === "sms" ? 320 : 4000),
        reason: reason || "Max tidied it up.",
      };
    }
    // Includes "fix" with nothing to fix it to.
    return unsure(reason);
  } catch {
    return unsure("Max couldn't read this one — over to you.");
  }
}
