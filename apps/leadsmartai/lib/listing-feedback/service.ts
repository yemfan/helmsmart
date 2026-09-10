import "server-only";

import { loadAgentDisplayIdentity } from "@/lib/agents/displayIdentity.server";
import { sendEmail } from "@/lib/email";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { generateOpenHouseSlug } from "@/lib/open-houses/slug";
import { renderFeedbackRequestEmail } from "./renderRequestEmail";
import type { ListingFeedbackRow } from "./types";

/**
 * Agent-scoped service for cross-agent listing feedback.
 *
 *   * createRequest — generates a slug, inserts the row. No email
 *     yet; agent decides when to send (inline "Send request" action).
 *   * sendRequest — renders + sends the feedback-request email.
 *     Stamps request_email_sent_at on success.
 *   * listForTransaction — all feedback rows on a single listing,
 *     newest responses first then pending.
 *   * deleteFeedback — remove a row (e.g. if created in error).
 *
 * Ownership: agent_id + transaction-ownership both enforced.
 */

const SLUG_RETRY_MAX = 3;

export type CreateListingFeedbackInput = {
  agentId: string;
  transactionId: string;
  buyerAgentName?: string | null;
  buyerAgentEmail?: string | null;
  buyerAgentPhone?: string | null;
  buyerAgentBrokerage?: string | null;
  buyerName?: string | null;
  showingDate?: string | null;
};

async function assertListingTransactionOwned(
  agentId: string,
  transactionId: string,
): Promise<{ property_address: string; city: string | null; state: string | null } | null> {
  const { data } = await supabaseAdmin
    .from("transactions")
    .select("id, transaction_type, property_address, city, state")
    .eq("id", transactionId)
    .eq("agent_id", agentId)
    .maybeSingle();
  if (!data) return null;
  const row = data as {
    transaction_type: string;
    property_address: string;
    city: string | null;
    state: string | null;
  };
  if (row.transaction_type !== "listing_rep" && row.transaction_type !== "dual") {
    return null;
  }
  return {
    property_address: row.property_address,
    city: row.city,
    state: row.state,
  };
}

export async function createListingFeedback(
  input: CreateListingFeedbackInput,
): Promise<ListingFeedbackRow> {
  const listing = await assertListingTransactionOwned(input.agentId, input.transactionId);
  if (!listing) {
    throw new Error("Listing transaction not found.");
  }

  for (let attempt = 0; attempt < SLUG_RETRY_MAX; attempt++) {
    const slug = generateOpenHouseSlug(); // Same 12-char URL-safe generator
    const { data, error } = await supabaseAdmin
      .from("listing_feedback")
      .insert({
        agent_id: input.agentId,
        transaction_id: input.transactionId,
        buyer_agent_name: input.buyerAgentName ?? null,
        buyer_agent_email: input.buyerAgentEmail ?? null,
        buyer_agent_phone: input.buyerAgentPhone ?? null,
        buyer_agent_brokerage: input.buyerAgentBrokerage ?? null,
        buyer_name: input.buyerName ?? null,
        showing_date: input.showingDate ?? null,
        request_slug: slug,
      })
      .select("*")
      .single();
    if (!error && data) return data as ListingFeedbackRow;
    const code = (error as { code?: string } | null)?.code;
    if (code !== "23505") {
      throw new Error(error?.message ?? "Failed to create feedback request");
    }
  }
  throw new Error("Could not generate a unique feedback slug");
}

export async function listFeedbackForTransaction(
  agentId: string,
  transactionId: string,
): Promise<ListingFeedbackRow[]> {
  const owned = await assertListingTransactionOwned(agentId, transactionId);
  if (!owned) return [];
  const { data, error } = await supabaseAdmin
    .from("listing_feedback")
    .select("*")
    .eq("agent_id", agentId)
    .eq("transaction_id", transactionId)
    .order("submitted_at", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as ListingFeedbackRow[];
}

export async function deleteListingFeedback(
  agentId: string,
  id: string,
): Promise<boolean> {
  const { error, count } = await supabaseAdmin
    .from("listing_feedback")
    .delete({ count: "exact" })
    .eq("id", id)
    .eq("agent_id", agentId);
  if (error) throw new Error(error.message);
  return (count ?? 0) > 0;
}

/**
 * Sends (or re-sends) the feedback-request email to the buyer agent.
 * If the row has no buyer_agent_email, this is a no-op that returns
 * { sent: false } — caller surfaces an error to the UI.
 */
export async function sendFeedbackRequest(
  agentId: string,
  id: string,
  appBaseUrl: string,
): Promise<{ sent: boolean; reason?: string }> {
  const { data: row, error } = await supabaseAdmin
    .from("listing_feedback")
    .select("*")
    .eq("id", id)
    .eq("agent_id", agentId)
    .maybeSingle();
  if (error || !row) {
    return { sent: false, reason: "Feedback request not found." };
  }
  const feedback = row as ListingFeedbackRow;
  if (!feedback.buyer_agent_email) {
    return { sent: false, reason: "No buyer-agent email on file." };
  }

  const { data: tx } = await supabaseAdmin
    .from("transactions")
    .select("property_address, city, state")
    .eq("id", feedback.transaction_id)
    .maybeSingle();
  const listing = tx as {
    property_address: string;
    city: string | null;
    state: string | null;
  } | null;
  if (!listing) {
    return { sent: false, reason: "Parent listing not found." };
  }

  // Resolve the listing agent's display name for the from-line text.
  // Best-effort: the request still goes out unsigned if this fails.
  const agent = await loadAgentDisplayIdentity(agentId).catch((e) => {
    console.warn("[listing-feedback] agent lookup failed:", e instanceof Error ? e.message : e);
    return null;
  });
  const listingAgentName = agent?.fullName ?? null;

  const formUrl = `${appBaseUrl}/feedback/${feedback.request_slug}`;
  const { subject, html, text } = renderFeedbackRequestEmail({
    buyerAgentName: feedback.buyer_agent_name ?? null,
    propertyAddress: listing.property_address,
    city: listing.city,
    state: listing.state,
    showingDate: feedback.showing_date,
    formUrl,
    listingAgentName,
    brokerage: agent?.brokerage ?? null,
  });

  await sendEmail({ to: feedback.buyer_agent_email, subject, text, html });
  await supabaseAdmin
    .from("listing_feedback")
    .update({
      request_email_sent_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);
  return { sent: true };
}
