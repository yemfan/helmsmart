import "server-only";

import { getAnthropicClient, isAnthropicConfigured } from "@/lib/anthropic";
import type { InboundIntent } from "./intent";

/**
 * AI classifier overlay for inbound emails (Phase 2B-3).
 *
 * The keyword classifier in `intent.ts` catches the obvious cases —
 * subject lines that contain literal "offer", "listing agreement",
 * "schedule a showing", etc. It misses the long tail:
 *
 *   - "RE: 123 Main" (counter offer thread)
 *   - "Updated terms attached"
 *   - "Counter on the duplex"
 *   - "Wants to see Saturday"
 *   - "Re-list" (RLA renewal)
 *   - Forwarded MLS portal notifications with weird subjects
 *
 * Strategy: keyword classifier runs first. When it returns `unknown`
 * AND there's signal worth burning an LLM call on (a PDF attached, or
 * non-trivial body text), we fall through to this AI overlay. Cheap
 * (Claude haiku, single ~200ms call) and conservative — when AI is
 * unsure, it still returns `unknown` and we don't pretend.
 *
 * Cost cap: env-gated. Set INBOUND_AI_CLASSIFIER_ENABLED=false to
 * disable without redeploying code (e.g. if budget alerts fire). The
 * default-on behavior is intentional — this overlay is the difference
 * between catching ~80% of inbound vs ~95%.
 */

const SYSTEM_PROMPT = `You classify inbound real-estate emails into one intent:

- "offer_received"     — buyer or buyer's agent is presenting an offer, counter-offer, or purchase agreement to the listing agent.
- "listing_signed"     — seller has signed a listing agreement (RLA), or the listing brokerage is confirming a new listing.
- "showing_requested"  — a buyer or buyer's agent wants to schedule a property tour / showing / viewing.
- "inspection"         — anything about the home/property inspection: scheduling, the inspection report, repair requests, or the inspection contingency.
- "appraisal"          — anything about the appraisal: ordering/scheduling it, the appraisal report or value, or the appraisal contingency/gap.
- "financing"          — buyer's loan/mortgage: pre-approval, loan approval/commitment, underwriting, "clear to close", or the financing/loan contingency.
- "title_escrow"       — title or escrow company comms: escrow opened/instructions, preliminary title, the Closing Disclosure / settlement statement, or wire instructions.
- "closing"            — the close itself: close-of-escrow date, signing/notary appointment, final walkthrough, possession/keys, or recording.
- "transaction_doc"    — an executed/signed transaction document for the file that isn't one of the above: an addendum, amendment, or seller disclosure package.
- "unknown"            — none clearly apply, or it's something else (drip-marketing, MLS market reports, social pings, etc.)

These map to a transaction's lifecycle (offer → inspection → appraisal → financing → title/escrow → closing). Pick the single stage the email is most about.

Be conservative: when it could be multiple OR doesn't clearly match one, return "unknown". A wrong intent mis-files the email — worse than "unknown" + a manual review.

Respond with ONLY the intent string — one of the words above. No prose, no JSON, no quotes.`;

const PROMPT_BODY_LIMIT = 1500;
const PROMPT_FILENAMES_LIMIT = 200;

/**
 * Run the AI classifier. Returns null when:
 *   * Anthropic isn't configured (env var missing — should never
 *     hit production but keeps local dev clean)
 *   * The kill switch is engaged (INBOUND_AI_CLASSIFIER_ENABLED=false)
 *   * The model returns garbage we can't coerce
 *
 * Caller must fall back to whatever the keyword classifier already
 * returned (typically `unknown`) when this returns null.
 */
export async function aiClassifyInboundEmail(input: {
  subject: string | null;
  text: string | null;
  attachmentFilenames: string[];
}): Promise<InboundIntent | null> {
  if (process.env.INBOUND_AI_CLASSIFIER_ENABLED === "false") {
    return null;
  }
  if (!isAnthropicConfigured()) {
    return null;
  }

  const subjectClean = (input.subject ?? "").trim() || "(no subject)";
  const textClean = (input.text ?? "").trim().slice(0, PROMPT_BODY_LIMIT);
  const filenamesClean = input.attachmentFilenames
    .filter((n) => typeof n === "string" && n.trim().length > 0)
    .join(", ")
    .slice(0, PROMPT_FILENAMES_LIMIT);

  const userMessage = [
    `SUBJECT: ${subjectClean}`,
    filenamesClean ? `ATTACHMENTS: ${filenamesClean}` : "",
    "",
    "BODY (first ~1500 chars):",
    textClean || "(empty)",
  ]
    .filter(Boolean)
    .join("\n");

  try {
    const client = getAnthropicClient();
    const response = await client.messages.create({
      model: "claude-haiku-4-5",
      max_tokens: 16, // 4 short tokens at most
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: userMessage }],
    });
    const textBlock = response.content.find((b) => b.type === "text");
    if (!textBlock || textBlock.type !== "text") return null;
    return coerceIntent(textBlock.text);
  } catch (e) {
    // Don't throw — a failed AI call shouldn't drop the email. The
    // webhook keeps the keyword-classifier result and moves on.
    console.warn(
      "[inbound] aiClassify failed:",
      e instanceof Error ? e.message : e,
    );
    return null;
  }
}

/**
 * Coerce loose LLM output into a known InboundIntent. Tolerant of
 * wrapping quotes / trailing punctuation / case variation. Returns
 * null when the response doesn't match any known intent.
 */
function coerceIntent(raw: string): InboundIntent | null {
  const cleaned = raw
    .toLowerCase()
    .replace(/[^a-z_]/g, "")
    .trim();
  const KNOWN: InboundIntent[] = [
    "offer_received",
    "listing_signed",
    "showing_requested",
    "inspection",
    "appraisal",
    "financing",
    "title_escrow",
    "closing",
    "transaction_doc",
    "unknown",
  ];
  return (KNOWN as string[]).includes(cleaned) ? (cleaned as InboundIntent) : null;
}
