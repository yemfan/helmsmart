import "server-only";
import { getAnthropicClient } from "@/lib/anthropic";
import { languageDirectiveForExtraction } from "@/lib/i18n/languageDirective";

/**
 * Showing-request extractor (Phase 2B-2).
 *
 * Showing-request emails arrive as plain text — almost never a PDF —
 * so unlike `extractOfferFromPdf` and `extractListingAgreement`,
 * this extractor consumes subject + body strings instead of binary
 * document content.
 *
 * Output shape mirrors what /dashboard/showings/new needs to prefill:
 *   - requester contact fields (name + phone + email) so the agent
 *     can resolve them against an existing CRM contact or create a
 *     new one
 *   - property address (the listing being requested)
 *   - requested date + time (separated to match the form's date/time
 *     input pair — see NewShowingClient)
 *   - free-form notes (special instructions, accessibility, party size)
 *
 * Conservative null semantics: every field can be null. Falls back to
 * the agent typing missing values manually rather than the model
 * guessing. False positives here cost the agent a wrong booking.
 */

export type ShowingRequestExtraction = {
  requesterName: string | null;
  requesterPhone: string | null;
  requesterEmail: string | null;
  propertyAddress: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  /** ISO date "YYYY-MM-DD" — null when only a relative date was given. */
  requestedDate: string | null;
  /** 24h time "HH:MM" — null when no specific time was given. */
  requestedTime: string | null;
  notes: string | null;
  /** 0-1 — how confident the extractor is in the structured fields. */
  confidence: number;
  warnings: string[];
};

const SCHEMA_DESCRIPTION = `
Return JSON with this exact shape. Every field can be null if the email doesn't contain it or if it's ambiguous:

{
  "requesterName": string | null,         // full name of the person requesting the showing
  "requesterPhone": string | null,        // best-guess US 10-digit number, formatted "(xxx) xxx-xxxx"
  "requesterEmail": string | null,        // valid email if mentioned in the body or signature
  "propertyAddress": string | null,       // street address only, e.g. "123 Main St"
  "city": string | null,
  "state": string | null,                  // 2-letter US state code
  "zip": string | null,
  "requestedDate": "YYYY-MM-DD" | null,    // ISO date, null when only relative ("this Saturday") or vague
  "requestedTime": "HH:MM" | null,         // 24h, null when not stated
  "notes": string | null,                  // free-form context the agent should know — accessibility, party size, special instructions, etc. Max ~300 chars.
  "confidence": number,                    // 0-1
  "warnings": string[]                     // e.g. "ambiguous date - 'next week' was used", "phone number was illegible"
}

Return ONLY this JSON. No prose, no markdown, no code fences.
`;

const SYSTEM_PROMPT = `You are a real-estate showing-request extraction assistant. You read forwarded emails — usually from MLS portals (Showing Time, BrokerBay, Aligned Showings) or directly from buyers — and extract structured booking details for the agent's transaction coordinator.

Be conservative: when a field isn't clearly stated, return null. Don't guess dates from "soon" or "next week" — return null and add a warning. Don't fabricate phone numbers from area-code patterns.

Date interpretation:
- If the email gives a specific date ("Saturday May 11, 2026" or "5/11"), return YYYY-MM-DD assuming the closest future date.
- If the email gives only a day-of-week ("this Saturday"), return null and add a warning that the resolution was ambiguous.
- If the email gives a date AND time, return both. If only one, leave the other null.

Phone format: prefer "(xxx) xxx-xxxx" US display format. Strip extensions and country codes. If you see only a 10-digit string, format it.

Email-finding: scan the body AND the signature block. Many requesters sign their personal Gmail at the bottom even when the email is sent through a portal.`;

const USER_INSTRUCTION = (subject: string | null, text: string) =>
  `Extract showing-request facts from this forwarded email.

SUBJECT: ${subject ?? "(no subject)"}

BODY:
${text.slice(0, 8000)}

${SCHEMA_DESCRIPTION}`;

/**
 * @param locale The realtor's language. Governs `notes` and `warnings` only —
 *   every other field was lifted out of the email and must stay verbatim.
 */
export async function extractShowingRequest(input: {
  subject: string | null;
  text: string;
  locale?: string | null;
}): Promise<ShowingRequestExtraction> {
  const client = getAnthropicClient();

  // Haiku is plenty for short text; don't pay for sonnet here.
  // The PDF extractors for offers + RLAs are sonnet because PDFs
  // need stronger doc-understanding; plain showing-request emails
  // don't.
  const response = await client.messages.create({
    model: "claude-haiku-4-5",
    max_tokens: 1024,
    system:
      SYSTEM_PROMPT +
      languageDirectiveForExtraction(input.locale, ["notes", "warnings"]),
    messages: [
      { role: "user", content: USER_INSTRUCTION(input.subject, input.text) },
    ],
  });

  const textBlock = response.content.find((b) => b.type === "text");
  if (!textBlock || textBlock.type !== "text") {
    throw new Error("Showing-request extractor returned no text content");
  }
  return parseExtractionResponse(textBlock.text);
}

/**
 * Tolerant JSON parser. Strips ```json fences and surrounding prose
 * (Claude occasionally adds them despite the instruction). Coerces
 * loose types into the strict ShowingRequestExtraction shape.
 */
export function parseExtractionResponse(raw: string): ShowingRequestExtraction {
  const jsonText = stripFences(raw).trim();
  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonText);
  } catch {
    throw new Error(
      `Showing-request extractor did not return valid JSON: ${raw.slice(0, 200)}`,
    );
  }
  if (typeof parsed !== "object" || parsed === null) {
    throw new Error("Showing-request extractor response was not an object");
  }
  const p = parsed as Record<string, unknown>;
  return {
    requesterName: asNullableString(p.requesterName),
    requesterPhone: asNullableString(p.requesterPhone),
    requesterEmail: asNullableString(p.requesterEmail),
    propertyAddress: asNullableString(p.propertyAddress),
    city: asNullableString(p.city),
    state: asNullableString(p.state)?.slice(0, 2)?.toUpperCase() ?? null,
    zip: asNullableString(p.zip),
    requestedDate: asIsoDate(p.requestedDate),
    requestedTime: asTime24(p.requestedTime),
    notes: asNullableString(p.notes),
    confidence: clampConfidence(p.confidence),
    warnings: asStringArray(p.warnings),
  };
}

function stripFences(s: string): string {
  const fenced = s.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
  return fenced ? fenced[1] : s;
}

function asNullableString(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const trimmed = v.trim();
  return trimmed ? trimmed : null;
}

function asIsoDate(v: unknown): string | null {
  const s = asNullableString(v);
  if (!s) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  // Tolerant: accept MM/DD/YYYY too — the model occasionally returns it.
  const mdy = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (mdy) {
    const [, m, d, y] = mdy;
    return `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
  }
  return null;
}

function asTime24(v: unknown): string | null {
  const s = asNullableString(v);
  if (!s) return null;
  // Accept "HH:MM" (24h)
  if (/^([01]\d|2[0-3]):[0-5]\d$/.test(s)) return s;
  // Tolerant: "H:MM AM/PM" → 24h.
  const ampm = s.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
  if (ampm) {
    let hour = Number(ampm[1]);
    const minute = ampm[2];
    const meridian = ampm[3].toUpperCase();
    if (meridian === "PM" && hour < 12) hour += 12;
    if (meridian === "AM" && hour === 12) hour = 0;
    return `${String(hour).padStart(2, "0")}:${minute}`;
  }
  return null;
}

function asStringArray(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v.filter((x) => typeof x === "string" && x.trim().length > 0) as string[];
}

function clampConfidence(v: unknown): number {
  if (typeof v === "number" && Number.isFinite(v)) {
    return Math.max(0, Math.min(1, v));
  }
  return 0;
}
