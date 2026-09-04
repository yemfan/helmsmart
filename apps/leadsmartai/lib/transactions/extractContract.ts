import "server-only";

import { getAnthropicClient } from "@/lib/anthropic";
import { languageDirectiveForExtraction } from "@/lib/i18n/languageDirective";

/**
 * Extracts structured deal facts from a ratified CAR RPA (California
 * Residential Purchase Agreement) PDF.
 *
 * Why a separate module vs inlining the prompt:
 *   * The prompt is long and the schema is tight — keeping it in a
 *     testable pure function lets us iterate on prompt wording without
 *     touching the API route.
 *   * Future: other state-specific contracts (TX, FL) will plug in as
 *     alternate extractors with the same ContractExtraction shape.
 *
 * Returned shape is deliberately "everything is nullable" — the UI
 * validates presence itself and lets the agent fill gaps. Forcing the
 * model to guess numerics it can't see reliably produces worse UX than
 * showing null + letting the agent type the number.
 */

export type ContractExtraction = {
  propertyAddress: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  purchasePrice: number | null;
  mutualAcceptanceDate: string | null; // YYYY-MM-DD
  closingDate: string | null; // YYYY-MM-DD
  buyerNames: string[]; // may be multiple for co-buyers
  sellerNames: string[];
  contingencies: {
    inspectionDays: number | null; // CA RPA default: 17
    appraisalDays: number | null; // default: 17
    loanDays: number | null; // default: 21
  };
  /** 0-1. How confident the extractor is that key fields were correctly pulled. */
  confidence: number;
  /** Free-form notes when the PDF looks malformed, corrupted, or non-RPA. */
  warnings: string[];
};

const EXTRACTION_SCHEMA_DESCRIPTION = `
Return JSON with this exact shape. Every field can be null if the document doesn't contain it or if it's illegible:

{
  "propertyAddress": string | null,   // street address only, e.g. "123 Main St"
  "city": string | null,
  "state": string | null,              // 2-letter code
  "zip": string | null,
  "purchasePrice": number | null,      // integer dollars, no commas or $
  "mutualAcceptanceDate": "YYYY-MM-DD" | null,  // the date all parties signed — the latest signature date
  "closingDate": "YYYY-MM-DD" | null,  // scheduled close of escrow
  "buyerNames": string[],              // full names, empty array if none found
  "sellerNames": string[],
  "contingencies": {
    "inspectionDays": number | null,   // paragraph 14 — typically "17 Days"
    "appraisalDays": number | null,    // paragraph 14 — typically "17 Days"
    "loanDays": number | null          // paragraph 3 — typically "21 Days"
  },
  "confidence": number,                // 0-1 — 0.9+ if clearly RPA with clean fills, 0.5-0.7 if some fields uncertain, <0.5 if major doubts
  "warnings": string[]                 // e.g. "document appears scanned at low resolution", "non-CAR-RPA format detected"
}

Return ONLY this JSON. No prose, no markdown, no code fences.
`;

const SYSTEM_PROMPT = `You are a licensed California real-estate contract extraction assistant. You read CAR (California Association of Realtors) Residential Purchase Agreement (RPA) documents and extract structured deal facts for a buyer-agent's transaction coordinator.

Be conservative: if a field isn't clearly present, return null. Do not guess. Do not hallucinate addresses, prices, or dates. If the document isn't a CAR RPA, return low confidence and a warning.

Dates: the "mutual acceptance date" is the latest signature date on the document — the date the last party signed, making the contract ratified. Return YYYY-MM-DD format.

Contingency day counts: paragraph 3 = loan contingency, paragraph 14 = inspection + appraisal contingencies. Extract the numeric day counts as shown (usually 17, 21, or custom overrides).`;

/**
 * Extracts fields from a PDF buffer. The caller should pass raw bytes,
 * not base64 — we convert here so the API stays clean.
 */
/**
 * @param locale The realtor's language. Governs `warnings` only — the contract's
 *   own names, addresses, dates and amounts are reproduced exactly.
 */
export async function extractContract(
  pdfBytes: Uint8Array,
  locale?: string | null,
): Promise<ContractExtraction> {
  return callExtractor({
    pdfBytes,
    systemPrompt: SYSTEM_PROMPT + languageDirectiveForExtraction(locale, ["warnings"]),
    userInstruction: `Extract the deal facts from this California RPA. ${EXTRACTION_SCHEMA_DESCRIPTION}`,
    parse: parseExtractionResponse,
  });
}

// ── Listing Agreement (RLA) extractor ─────────────────────────────────

export type ListingAgreementExtraction = {
  propertyAddress: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  listPrice: number | null;
  /** Date RLA was fully executed — signature of the latest signer. */
  listingStartDate: string | null;
  /** Date the listing expires per the RLA. */
  listingExpirationDate: string | null;
  sellerNames: string[];
  /** Commission percentage offered to the buyer's agent, e.g. 2.5. Null if not found. */
  commissionBuyerSidePct: number | null;
  /** Total listing commission pct, e.g. 5.0. Null if not found. */
  commissionTotalPct: number | null;
  confidence: number;
  warnings: string[];
};

const RLA_SCHEMA_DESCRIPTION = `
Return JSON with this exact shape. Every field can be null if the document doesn't contain it or if it's illegible:

{
  "propertyAddress": string | null,
  "city": string | null,
  "state": string | null,
  "zip": string | null,
  "listPrice": number | null,                   // integer dollars, no commas or $
  "listingStartDate": "YYYY-MM-DD" | null,      // date RLA fully executed
  "listingExpirationDate": "YYYY-MM-DD" | null, // listing period end date
  "sellerNames": string[],                       // full names, empty array if none found
  "commissionBuyerSidePct": number | null,       // e.g. 2.5 — percentage offered to the buyer's agent
  "commissionTotalPct": number | null,           // e.g. 5.0 — total commission the seller pays
  "confidence": number,                          // 0-1
  "warnings": string[]
}

Return ONLY this JSON. No prose, no markdown, no code fences.
`;

const RLA_SYSTEM_PROMPT = `You are a licensed California real-estate contract extraction assistant. You read CAR (California Association of Realtors) Residential Listing Agreement (RLA) documents and extract structured deal facts for a listing-agent's transaction coordinator.

Be conservative: if a field isn't clearly present, return null. Do not guess or hallucinate. If the document isn't a CAR RLA (e.g., it's an amendment, a purchase agreement, or a foreign listing contract), return low confidence and a warning.

Commission: if the RLA shows "5% total, 2.5% to buyer's broker," record total=5.0 and buyerSide=2.5. If only total is shown, record total and leave buyerSide null — don't guess the split.

Listing start date = the date the last party signed the RLA (fully executed). Listing expiration = the stated end date of the listing period (often "listing period through YYYY-MM-DD").`;

export async function extractListingAgreement(
  pdfBytes: Uint8Array,
): Promise<ListingAgreementExtraction> {
  return callExtractor({
    pdfBytes,
    systemPrompt: RLA_SYSTEM_PROMPT,
    userInstruction: `Extract the listing facts from this California RLA. ${RLA_SCHEMA_DESCRIPTION}`,
    parse: parseRlaExtractionResponse,
  });
}

// ── Shared plumbing ───────────────────────────────────────────────────

async function callExtractor<T>(opts: {
  pdfBytes: Uint8Array;
  systemPrompt: string;
  userInstruction: string;
  parse: (raw: string) => T;
}): Promise<T> {
  const client = getAnthropicClient();
  const base64 = Buffer.from(opts.pdfBytes).toString("base64");

  const response = await client.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 2048,
    system: opts.systemPrompt,
    messages: [
      {
        role: "user",
        content: [
          {
            type: "document",
            source: {
              type: "base64",
              media_type: "application/pdf",
              data: base64,
            },
          },
          { type: "text", text: opts.userInstruction },
        ],
      },
    ],
  });

  const textBlock = response.content.find((block) => block.type === "text");
  if (!textBlock || textBlock.type !== "text") {
    throw new Error("Extractor returned no text content");
  }
  return opts.parse(textBlock.text);
}

/**
 * Tolerant JSON parser. Claude occasionally wraps output in ```json fences
 * despite the instruction; we strip those and any surrounding prose.
 * Exported for unit-testing without hitting the API.
 */
export function parseExtractionResponse(raw: string): ContractExtraction {
  const jsonText = stripFences(raw).trim();

  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonText);
  } catch {
    throw new Error(`Extractor did not return valid JSON: ${raw.slice(0, 200)}`);
  }

  if (typeof parsed !== "object" || parsed === null) {
    throw new Error("Extractor response was not an object");
  }

  const p = parsed as Record<string, unknown>;
  const cont = (p.contingencies as Record<string, unknown> | undefined) ?? {};

  return {
    propertyAddress: asNullableString(p.propertyAddress),
    city: asNullableString(p.city),
    state: asNullableString(p.state),
    zip: asNullableString(p.zip),
    purchasePrice: asNullableNumber(p.purchasePrice),
    mutualAcceptanceDate: asIsoDate(p.mutualAcceptanceDate),
    closingDate: asIsoDate(p.closingDate),
    buyerNames: asStringArray(p.buyerNames),
    sellerNames: asStringArray(p.sellerNames),
    contingencies: {
      inspectionDays: asNullableNumber(cont.inspectionDays),
      appraisalDays: asNullableNumber(cont.appraisalDays),
      loanDays: asNullableNumber(cont.loanDays),
    },
    confidence: clampConfidence(p.confidence),
    warnings: asStringArray(p.warnings),
  };
}

function stripFences(s: string): string {
  // Handle ```json\n...\n``` and plain ```...```
  const fenced = s.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
  return fenced ? fenced[1] : s;
}

function asNullableString(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const trimmed = v.trim();
  return trimmed.length ? trimmed : null;
}

function asNullableNumber(v: unknown): number | null {
  if (v === null || v === undefined) return null;
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string") {
    const n = Number(v.replace(/[$,\s]/g, ""));
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function asIsoDate(v: unknown): string | null {
  const s = asNullableString(v);
  if (!s) return null;
  // Accept YYYY-MM-DD only. Claude sometimes returns "MM/DD/YYYY" —
  // convert. Anything else: drop.
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const mdy = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (mdy) {
    const [, m, d, y] = mdy;
    return `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
  }
  return null;
}

function asStringArray(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v.filter((x) => typeof x === "string" && x.trim().length > 0) as string[];
}

function clampConfidence(v: unknown): number {
  const n = asNullableNumber(v);
  if (n === null) return 0;
  return Math.max(0, Math.min(1, n));
}

/**
 * RLA-specific response parser. Same tolerance rules as the RPA parser
 * but different field shape.
 */
export function parseRlaExtractionResponse(raw: string): ListingAgreementExtraction {
  const jsonText = stripFences(raw).trim();
  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonText);
  } catch {
    throw new Error(`RLA extractor did not return valid JSON: ${raw.slice(0, 200)}`);
  }
  if (typeof parsed !== "object" || parsed === null) {
    throw new Error("RLA extractor response was not an object");
  }
  const p = parsed as Record<string, unknown>;
  return {
    propertyAddress: asNullableString(p.propertyAddress),
    city: asNullableString(p.city),
    state: asNullableString(p.state),
    zip: asNullableString(p.zip),
    listPrice: asNullableNumber(p.listPrice),
    listingStartDate: asIsoDate(p.listingStartDate),
    listingExpirationDate: asIsoDate(p.listingExpirationDate),
    sellerNames: asStringArray(p.sellerNames),
    commissionBuyerSidePct: asNullableNumber(p.commissionBuyerSidePct),
    commissionTotalPct: asNullableNumber(p.commissionTotalPct),
    confidence: clampConfidence(p.confidence),
    warnings: asStringArray(p.warnings),
  };
}
