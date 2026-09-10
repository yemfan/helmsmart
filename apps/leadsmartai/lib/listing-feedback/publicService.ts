import "server-only";

import { loadAgentDisplayIdentity } from "@/lib/agents/displayIdentity.server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import type {
  ListingFeedbackRow,
  OverallReaction,
  PriceFeedback,
} from "./types";

/**
 * Public (no-auth) service for the feedback form. Auth IS the slug —
 * whoever has the link can submit. That's by design: the listing agent
 * shares the URL via email with the buyer agent, who fills it in.
 *
 * One submit only: once `submitted_at` is non-null, further POSTs are
 * rejected. Prevents accidental double-fills (agent clicks "Submit"
 * twice, or forwards the email to their buyer who also fills it).
 */

export type PublicFeedbackInfo = {
  slug: string;
  propertyAddress: string;
  city: string | null;
  state: string | null;
  showingDate: string | null;
  listingAgentName: string | null;
  brokerage: string | null;
  buyerAgentName: string | null;
  alreadySubmitted: boolean;
};

export async function getPublicFeedbackBySlug(
  slug: string,
): Promise<PublicFeedbackInfo | null> {
  const { data } = await supabaseAdmin
    .from("listing_feedback")
    .select(
      "id, agent_id, transaction_id, buyer_agent_name, showing_date, submitted_at",
    )
    .eq("request_slug", slug)
    .maybeSingle();
  if (!data) return null;
  const row = data as Pick<
    ListingFeedbackRow,
    "id" | "agent_id" | "transaction_id" | "buyer_agent_name" | "showing_date" | "submitted_at"
  >;

  // Parent listing for address context.
  const { data: txRow } = await supabaseAdmin
    .from("transactions")
    .select("property_address, city, state")
    .eq("id", row.transaction_id)
    .maybeSingle();
  const tx = txRow as {
    property_address: string;
    city: string | null;
    state: string | null;
  } | null;

  // Listing agent display for the form header.
  let listingAgentName: string | null = null;
  let brokerage: string | null = null;
  try {
    const a = await loadAgentDisplayIdentity(row.agent_id);
    listingAgentName = a?.fullName ?? null;
    brokerage = a?.brokerage ?? null;
  } catch {
    // non-fatal
  }

  return {
    slug,
    propertyAddress: tx?.property_address ?? "the listing",
    city: tx?.city ?? null,
    state: tx?.state ?? null,
    showingDate: row.showing_date,
    listingAgentName,
    brokerage,
    buyerAgentName: row.buyer_agent_name,
    alreadySubmitted: Boolean(row.submitted_at),
  };
}

export type PublicSubmitInput = {
  slug: string;
  rating: number | null;
  overallReaction: OverallReaction | null;
  pros: string | null;
  cons: string | null;
  priceFeedback: PriceFeedback | null;
  wouldOffer: boolean | null;
  notes: string | null;
};

// `reason?: never` on the success branch lets callers access
// `result.reason` after `!result.ok` without needing an explicit
// `result.ok === false` narrow — the repo's `strict: false` tsconfig
// otherwise blocks that narrow. See lib/offer-expirations/extendToken.ts
// for the original incident.
export type PublicSubmitResult =
  | { ok: true; reason?: never }
  | { ok: false; reason: string };

export async function submitPublicFeedback(
  input: PublicSubmitInput,
): Promise<PublicSubmitResult> {
  if (!input.slug) return { ok: false, reason: "Missing slug" };

  // Validate inputs — coerce rather than reject on edge-cases, but
  // reject totally empty submissions.
  const rating =
    input.rating && Number.isFinite(input.rating) && input.rating >= 1 && input.rating <= 5
      ? Math.round(input.rating)
      : null;
  const reaction: OverallReaction | null =
    input.overallReaction &&
    ["love", "like", "maybe", "pass"].includes(input.overallReaction)
      ? input.overallReaction
      : null;
  const price: PriceFeedback | null =
    input.priceFeedback &&
    ["too_high", "about_right", "bargain"].includes(input.priceFeedback)
      ? input.priceFeedback
      : null;

  const hasSignal =
    rating != null ||
    reaction != null ||
    price != null ||
    input.wouldOffer != null ||
    truthyString(input.pros) ||
    truthyString(input.cons) ||
    truthyString(input.notes);
  if (!hasSignal) {
    return { ok: false, reason: "Please fill in at least one field before submitting." };
  }

  // Ensure the row exists + hasn't been submitted yet.
  const { data: existing } = await supabaseAdmin
    .from("listing_feedback")
    .select("id, submitted_at")
    .eq("request_slug", input.slug)
    .maybeSingle();
  if (!existing) return { ok: false, reason: "This link is invalid or expired." };
  const row = existing as { id: string; submitted_at: string | null };
  if (row.submitted_at) {
    return {
      ok: false,
      reason: "This feedback was already submitted. Thanks!",
    };
  }

  const { error } = await supabaseAdmin
    .from("listing_feedback")
    .update({
      submitted_at: new Date().toISOString(),
      rating,
      overall_reaction: reaction,
      pros: trim(input.pros),
      cons: trim(input.cons),
      price_feedback: price,
      would_offer: input.wouldOffer,
      notes: trim(input.notes),
      updated_at: new Date().toISOString(),
    })
    .eq("id", row.id);
  if (error) return { ok: false, reason: error.message };

  return { ok: true };
}

function trim(v: string | null | undefined): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t.length ? t : null;
}

function truthyString(v: string | null | undefined): boolean {
  return typeof v === "string" && v.trim().length > 0;
}
