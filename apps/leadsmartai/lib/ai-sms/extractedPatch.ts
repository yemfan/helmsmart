/**
 * Turn what the SMS assistant heard into a contact patch.
 *
 * The old mapper extracted a timeline and a budget and then wrote neither: it
 * only ever saved name, email, propertyAddress and intent. A lead could say
 * "Rowland Heights, 1 to 1.2 million, looking in about two months" and the
 * record afterwards showed none of it — the qualifying answers the assistant
 * had just worked to get were dropped on the floor.
 *
 * Two shapes were missing from the extraction itself:
 *
 *   - Nowhere to put an AREA. There was only `propertyAddress`, so a city like
 *     "Alhambra" landed in the field meant for a specific street address, and a
 *     buyer's target neighbourhood had no home at all.
 *   - A budget was a single number, which cannot hold "1 to 1.2 million". One
 *     end of every range was guaranteed to be lost.
 *
 * The voice path already models both properly (search_location vs
 * property_address, price_min vs price_max). This brings SMS to parity, so it
 * no longer matters which channel a lead answers through.
 *
 * Pure, so the rules below can be tested without a database: `lead-resolution`
 * imports supabaseAdmin, which a test cannot construct.
 */

export type SmsExtractedData = {
  // Nullable throughout: strict structured output cannot mark a field optional,
  // so the model returns null for anything the lead did not mention.
  name?: string | null;
  email?: string | null;
  propertyAddress?: string | null;
  searchLocation?: string | null;
  timeline?: string | null;
  budgetMin?: number | null;
  budgetMax?: number | null;
  beds?: number | null;
  baths?: number | null;
  preferredLanguage?: string | null;
};

/** The columns the builder reads to decide what is already known. */
export type ContactSnapshotForPatch = {
  name?: string | null;
  email?: string | null;
  preferred_language?: string | null;
  lead_type?: string | null;
};

/** Dollar figures outside this range are a misparse, not a budget. */
const MIN_PRICE = 100;
const MAX_PRICE = 100_000_000;

function cleanNumber(v: unknown): number | null {
  const n = typeof v === "number" ? v : Number(v);
  if (!Number.isFinite(n) || n <= 0) return null;
  return n;
}

function cleanPrice(v: unknown): number | null {
  const n = cleanNumber(v);
  if (n == null) return null;
  // A model that writes 1.2 for "1.2 million" would otherwise store a $1 budget
  // and make the contact look unqualified for ever.
  if (n < MIN_PRICE || n > MAX_PRICE) return null;
  return Math.round(n);
}

function cleanText(v: unknown, max: number): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t ? t.slice(0, max) : null;
}

/** buyer_* / seller_* intents imply what kind of lead this is. */
export function leadTypeFromIntent(intent: string): "buyer" | "seller" | null {
  if (intent.startsWith("buyer_")) return "buyer";
  if (intent.startsWith("seller_")) return "seller";
  return null;
}

export function buildSmsContactPatch(
  extracted: SmsExtractedData | null | undefined,
  inferredIntent: string,
  current: ContactSnapshotForPatch | null | undefined,
): Record<string, unknown> {
  const ex = extracted ?? {};
  const now = current ?? {};
  const patch: Record<string, unknown> = {};

  // --- Identity: fill a blank, never overwrite ------------------------------
  // What is already on file was typed by a person or confirmed on a call. A
  // name inferred from a text message is a weaker source and must not replace
  // it — "it's Mike" should not rename Michael Ye.
  const name = cleanText(ex.name, 120);
  if (name && !now.name?.trim()) patch.name = name;

  const email = cleanText(ex.email, 200);
  if (email && !now.email?.trim()) patch.email = email;

  const language = cleanText(ex.preferredLanguage, 10);
  if (language && !now.preferred_language?.trim()) patch.preferred_language = language;

  // --- Requirements: the latest word wins ----------------------------------
  // Unlike identity, these change legitimately as a conversation progresses. A
  // lead who says "actually up to 1.4" has revised their budget, not misspoken,
  // and the record should follow them.
  const propertyAddress = cleanText(ex.propertyAddress, 300);
  if (propertyAddress) patch.property_address = propertyAddress;

  const searchLocation = cleanText(ex.searchLocation, 200);
  if (searchLocation) patch.search_location = searchLocation;

  const timeline = cleanText(ex.timeline, 80);
  if (timeline) patch.timeline = timeline;

  let min = cleanPrice(ex.budgetMin);
  let max = cleanPrice(ex.budgetMax);
  // "1 to 1.2 million" arriving reversed is a transcription artefact, not a
  // lead who wants to spend between more and less.
  if (min != null && max != null && min > max) [min, max] = [max, min];
  if (min != null) patch.price_min = min;
  if (max != null) patch.price_max = max;

  const beds = cleanNumber(ex.beds);
  if (beds != null) patch.beds = Math.round(beds);

  const baths = cleanNumber(ex.baths);
  if (baths != null) patch.baths = baths;

  // --- Classification ------------------------------------------------------
  if (inferredIntent && inferredIntent !== "unknown") patch.intent = inferredIntent;

  // Fill a blank only. One ambiguous message should not reclassify a seller the
  // agent has been working for weeks.
  const leadType = leadTypeFromIntent(inferredIntent);
  if (leadType && !now.lead_type?.trim()) patch.lead_type = leadType;

  return patch;
}
