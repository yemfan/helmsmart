/**
 * Inbound-email intent classifier.
 *
 * Two layers:
 *   1. Keyword + heuristic (this file). Deterministic, free, ~80%
 *      coverage on real-world emails.
 *   2. AI overlay (`aiClassify.ts`, Phase 2B-3). Single Claude haiku
 *      call invoked only when the keyword pass returns `unknown` AND
 *      there's signal worth burning the call on. ~95% coverage when
 *      both layers run.
 *
 * The agent always reviews the resulting task before any extraction
 * → draft creation, so false positives at either layer just create
 * a slightly-mistitled review task, not a wrong offer.
 */

export type InboundIntent =
  | "offer_received"
  | "listing_signed"
  | "showing_requested"
  // Transaction-lifecycle stages (open escrow → close). Drive the
  // transaction timeline + deadline tasks once linked to a deal.
  | "inspection"
  | "appraisal"
  | "financing"
  | "title_escrow"
  | "closing"
  // Generic executed document for the file (addendum / disclosure / amendment).
  | "transaction_doc"
  | "unknown";

const OFFER_KEYWORDS = [
  "offer",
  "purchase agreement",
  "rpa",
  "earnest money",
  "counter",
  "counter-offer",
  "counteroffer",
  "ratified",
];

const LISTING_KEYWORDS = [
  "listing agreement",
  "rla",
  "residential listing",
  "exclusive right to sell",
  "list price",
  "exclusive agency",
];

const INSPECTION_KEYWORDS = [
  "home inspection",
  "property inspection",
  "inspection report",
  "inspection contingency",
  "request for repairs",
  "repair request",
  "inspector",
];

const APPRAISAL_KEYWORDS = [
  "appraisal",
  "appraiser",
  "appraised value",
  "appraisal report",
  "appraisal contingency",
  "appraisal gap",
];

const FINANCING_KEYWORDS = [
  "loan approval",
  "loan commitment",
  "pre-approval",
  "preapproval",
  "financing contingency",
  "loan contingency",
  "underwriting",
  "clear to close",
  "mortgage commitment",
];

const TITLE_ESCROW_KEYWORDS = [
  "escrow",
  "title company",
  "title commitment",
  "preliminary title",
  "prelim title",
  "closing disclosure",
  "settlement statement",
  "escrow instructions",
  "wire instructions",
];

const CLOSING_KEYWORDS = [
  "close of escrow",
  "closing appointment",
  "closing date",
  "final walkthrough",
  "final walk-through",
  "signing appointment",
  "possession",
  "recording confirmation",
];

const TRANSACTION_DOC_KEYWORDS = [
  "addendum",
  "amendment",
  "seller disclosure",
  "disclosure package",
  "transfer disclosure",
  "executed",
  "signed and attached",
];

const SHOWING_KEYWORDS = [
  "showing request",
  "request a showing",
  "request to show",
  "schedule a showing",
  "schedule a tour",
  "schedule a viewing",
  "tour request",
  "showing time",
  "showing appointment",
];

function matchesAny(haystack: string, needles: string[]): boolean {
  const lower = haystack.toLowerCase();
  for (const n of needles) {
    if (lower.includes(n)) return true;
  }
  return false;
}

/**
 * Classify by subject + body. Order matters when keywords overlap:
 * offer keywords are most specific (an offer email rarely says
 * "schedule a showing" without also saying "offer"), so check
 * offers first, then listings, then showings.
 */
export function classifyInboundEmail(input: {
  subject: string | null;
  text: string | null;
  hasPdfAttachment: boolean;
}): InboundIntent {
  const haystack = `${input.subject ?? ""}\n${input.text ?? ""}`;

  // Offers/listings are the most specific contract signals — check first.
  if (matchesAny(haystack, OFFER_KEYWORDS)) return "offer_received";
  if (matchesAny(haystack, LISTING_KEYWORDS)) return "listing_signed";
  // In-escrow transaction stages, roughly chronological. First match wins;
  // the AI overlay handles the ambiguous long tail when this returns unknown.
  if (matchesAny(haystack, INSPECTION_KEYWORDS)) return "inspection";
  if (matchesAny(haystack, APPRAISAL_KEYWORDS)) return "appraisal";
  if (matchesAny(haystack, FINANCING_KEYWORDS)) return "financing";
  if (matchesAny(haystack, TITLE_ESCROW_KEYWORDS)) return "title_escrow";
  if (matchesAny(haystack, CLOSING_KEYWORDS)) return "closing";
  if (matchesAny(haystack, SHOWING_KEYWORDS)) return "showing_requested";
  if (matchesAny(haystack, TRANSACTION_DOC_KEYWORDS)) return "transaction_doc";

  // No keyword hit — caller may fall through to the AI overlay.
  return "unknown";
}

/** Human-friendly label for the intent — used in task titles. */
export function intentLabel(intent: InboundIntent): string {
  switch (intent) {
    case "offer_received":
      return "Offer";
    case "listing_signed":
      return "Listing agreement";
    case "showing_requested":
      return "Showing request";
    case "inspection":
      return "Inspection";
    case "appraisal":
      return "Appraisal";
    case "financing":
      return "Financing";
    case "title_escrow":
      return "Title & escrow";
    case "closing":
      return "Closing";
    case "transaction_doc":
      return "Transaction document";
    case "unknown":
      return "Email";
  }
}
