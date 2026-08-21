import type { IdxReplyContext } from "@/lib/aiReplyGenerator";

/**
 * Parse `contacts.notes` for IDX-captured context. The IDX lead-capture
 * endpoint stores a JSON blob in `notes` with `idx_action`, `listing_id`,
 * `listing_address`, `listing_price`, `search_filters`. Non-IDX leads have a
 * plain-text or null `notes` value, in which case JSON.parse throws and we
 * return null cleanly.
 */
export function parseIdxContextFromNotes(notes: string | null | undefined): IdxReplyContext | null {
  if (!notes || typeof notes !== "string") return null;
  try {
    const parsed = JSON.parse(notes) as Record<string, unknown>;
    if (!parsed || typeof parsed !== "object") return null;
    const action = parsed.idx_action;
    if (typeof action !== "string") return null;
    return {
      action,
      listingId: typeof parsed.listing_id === "string" ? parsed.listing_id : null,
      listingAddress: typeof parsed.listing_address === "string" ? parsed.listing_address : null,
      listingPrice: typeof parsed.listing_price === "number" ? parsed.listing_price : null,
      searchFilters:
        parsed.search_filters && typeof parsed.search_filters === "object"
          ? (parsed.search_filters as Record<string, unknown>)
          : null,
    };
  } catch {
    return null;
  }
}
