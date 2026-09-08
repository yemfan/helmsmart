import "server-only";

import { supabaseAdmin } from "@/lib/supabase/admin";
import {
  deleteShowingFromGoogle,
  needsResync,
  syncShowingToGoogle,
} from "./googleSync";
import type {
  ContactShowingStats,
  OverallReaction,
  ShowingFeedbackRow,
  ShowingListItem,
  ShowingRow,
  ShowingStatus,
} from "./types";

/**
 * Service layer for buyer-side showings.
 *
 * All writes use `supabaseAdmin` (service role) so they bypass RLS — API
 * routes enforce agent ownership at the auth layer (`agent_id` match).
 *
 * Feedback upsert semantics:
 *   showing_feedback has a unique(showing_id) so a single showing has at
 *   most one feedback row. Re-submitting replaces prior values. Multi-
 *   visit feedback is a scope cut; if we need it later, drop the
 *   constraint and key by (showing_id, created_at) instead.
 */

// ── CREATE ────────────────────────────────────────────────────────────

export type CreateShowingInput = {
  agentId: string;
  contactId: string;
  propertyAddress: string;
  scheduledAt: string; // ISO timestamptz
  city?: string | null;
  state?: string | null;
  zip?: string | null;
  mlsNumber?: string | null;
  mlsUrl?: string | null;
  durationMinutes?: number | null;
  accessNotes?: string | null;
  listingAgentName?: string | null;
  listingAgentEmail?: string | null;
  listingAgentPhone?: string | null;
  notes?: string | null;
};

export async function createShowing(input: CreateShowingInput): Promise<ShowingRow> {
  const { data, error } = await supabaseAdmin
    .from("showings")
    .insert({
      agent_id: input.agentId,
      contact_id: input.contactId,
      property_address: input.propertyAddress,
      city: input.city ?? null,
      state: input.state ?? null,
      zip: input.zip ?? null,
      mls_number: input.mlsNumber ?? null,
      mls_url: input.mlsUrl ?? null,
      scheduled_at: input.scheduledAt,
      duration_minutes: input.durationMinutes ?? 30,
      access_notes: input.accessNotes ?? null,
      listing_agent_name: input.listingAgentName ?? null,
      listing_agent_email: input.listingAgentEmail ?? null,
      listing_agent_phone: input.listingAgentPhone ?? null,
      notes: input.notes ?? null,
    })
    .select("*")
    .single();
  if (error || !data) throw new Error(error?.message ?? "Failed to create showing");
  const row = data as ShowingRow;

  // Fire-and-forget Google Calendar sync. If the agent hasn't connected
  // Google, upsertGoogleEvent returns null and we leave google_event_id
  // null — the showing is still valid, it just isn't on their calendar.
  const contactName = await fetchContactDisplayName(input.contactId);
  const { googleEventId } = await syncShowingToGoogle(row, contactName);
  if (googleEventId && googleEventId !== row.google_event_id) {
    await supabaseAdmin
      .from("showings")
      .update({ google_event_id: googleEventId })
      .eq("id", row.id);
    row.google_event_id = googleEventId;
  }

  // Scheduling a showing IS contact activity. Bump last_activity_at
  // and auto-complete any open "Follow up with inactive lead" tasks
  // — the agent is actively working this contact right now.
  try {
    const { markContactActivity } = await import("@/lib/contacts/activity");
    await markContactActivity(input.agentId, input.contactId, {
      contactName,
    });
  } catch {
    // best-effort housekeeping
  }

  return row;
}

// ── READ ──────────────────────────────────────────────────────────────

export async function listShowingsForAgent(
  agentId: string,
  opts?: { contactId?: string },
): Promise<ShowingListItem[]> {
  // Three batched queries instead of a PostgREST `contacts!inner(...)`
  // embed: showings rows, then contacts by id, then feedback by
  // showing_id. The embed kept failing on production with "Could not
  // find a relationship between 'showings' and 'contacts' in the schema
  // cache" whenever PostgREST's schema cache lost the FK.
  let query = supabaseAdmin
    .from("showings")
    .select("*")
    .eq("agent_id", agentId)
    .order("scheduled_at", { ascending: false });
  if (opts?.contactId) query = query.eq("contact_id", opts.contactId);

  const { data, error } = await query;
  if (error) throw new Error(error.message);
  if (!data || data.length === 0) return [];

  const rows = data as ShowingRow[];
  const showingIds = rows.map((r) => r.id);
  const contactIds = Array.from(
    new Set(rows.map((r) => r.contact_id).filter((v): v is string => Boolean(v))),
  );

  type ContactRow = {
    id: string;
    name: string | null;
    first_name: string | null;
    last_name: string | null;
    email: string | null;
  };
  type FeedbackSummary = {
    showing_id: string;
    rating: number | null;
    overall_reaction: OverallReaction | null;
    would_offer: boolean;
  };

  // Run contact + feedback fetches in parallel — they're independent.
  const [contactRes, feedbackRes] = await Promise.all([
    contactIds.length > 0
      ? supabaseAdmin
          .from("contacts")
          .select("id, name, first_name, last_name, email")
          .in("id", contactIds)
      : Promise.resolve({ data: [] as ContactRow[], error: null as null }),
    supabaseAdmin
      .from("showing_feedback")
      .select("showing_id, rating, overall_reaction, would_offer")
      .in("showing_id", showingIds),
  ]);
  if (contactRes.error) throw new Error(contactRes.error.message);

  const contactById = new Map<string, ContactRow>();
  for (const c of (contactRes.data ?? []) as ContactRow[]) {
    contactById.set(c.id, c);
  }
  const feedbackByShowing = new Map<string, FeedbackSummary>();
  for (const f of (feedbackRes.data ?? []) as FeedbackSummary[]) {
    feedbackByShowing.set(f.showing_id, f);
  }

  return rows.map((row) => {
    const c = row.contact_id ? contactById.get(row.contact_id) ?? null : null;
    const contactName =
      (c?.first_name || c?.last_name
        ? `${c?.first_name ?? ""} ${c?.last_name ?? ""}`.trim()
        : c?.name) ?? c?.email ?? null;
    const f = feedbackByShowing.get(row.id);
    return {
      ...row,
      contact_name: contactName,
      feedback_rating: f?.rating ?? null,
      feedback_reaction: f?.overall_reaction ?? null,
      feedback_would_offer: f?.would_offer ?? false,
    };
  });
}

export async function getShowingWithFeedback(
  agentId: string,
  id: string,
): Promise<{
  showing: ShowingRow;
  feedback: ShowingFeedbackRow | null;
  contactName: string | null;
  siblingShowings: ShowingListItem[]; // same buyer, excluding current
} | null> {
  // Same shape as listShowingsForAgent — flat showings select, contact
  // looked up separately to avoid PostgREST schema-cache fragility.
  const { data: showingData, error } = await supabaseAdmin
    .from("showings")
    .select("*")
    .eq("agent_id", agentId)
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!showingData) return null;

  const showing = showingData as ShowingRow;
  const contactName = showing.contact_id
    ? await fetchContactDisplayName(showing.contact_id)
    : null;

  // Feedback + other showings for the same buyer, in parallel.
  const [{ data: fbData }, siblings] = await Promise.all([
    supabaseAdmin.from("showing_feedback").select("*").eq("showing_id", id).maybeSingle(),
    listShowingsForAgent(agentId, { contactId: showing.contact_id }),
  ]);

  return {
    showing,
    feedback: (fbData as ShowingFeedbackRow | null) ?? null,
    contactName,
    siblingShowings: siblings.filter((s) => s.id !== id),
  };
}

// ── UPDATE ────────────────────────────────────────────────────────────

export type UpdateShowingInput = Partial<{
  property_address: string;
  city: string | null;
  state: string | null;
  zip: string | null;
  mls_number: string | null;
  mls_url: string | null;
  scheduled_at: string;
  duration_minutes: number | null;
  access_notes: string | null;
  listing_agent_name: string | null;
  listing_agent_email: string | null;
  listing_agent_phone: string | null;
  status: ShowingStatus;
  cancellation_reason: string | null;
  notes: string | null;
}>;

export async function updateShowing(
  agentId: string,
  id: string,
  input: UpdateShowingInput,
): Promise<ShowingRow | null> {
  // Snapshot pre-update state so we can detect whether the Google event
  // needs re-syncing (time/address change) and whether status moved to
  // cancelled (delete the event).
  const { data: before } = await supabaseAdmin
    .from("showings")
    .select("*")
    .eq("id", id)
    .eq("agent_id", agentId)
    .maybeSingle();
  if (!before) return null;

  const patch = { ...input, updated_at: new Date().toISOString() };
  const { data, error } = await supabaseAdmin
    .from("showings")
    .update(patch)
    .eq("id", id)
    .eq("agent_id", agentId)
    .select("*")
    .maybeSingle();
  if (error) throw new Error(error.message);
  const after = (data as ShowingRow | null) ?? null;
  if (!after) return null;

  // If the status just flipped to cancelled, drop the Google event.
  // Other status transitions (scheduled → attended) keep the event;
  // the agent may want it on their calendar as a historical record.
  const beforeStatus = (before as ShowingRow).status;
  const statusChanged = input.status !== undefined && input.status !== beforeStatus;
  if (statusChanged && input.status === "cancelled" && after.google_event_id) {
    await deleteShowingFromGoogle(agentId, after.google_event_id);
    await supabaseAdmin
      .from("showings")
      .update({ google_event_id: null })
      .eq("id", id);
    after.google_event_id = null;
    return after;
  }

  // If time/address changed and we still have an event, push the update.
  if (needsResync(before as ShowingRow, input) && after.status !== "cancelled") {
    const contactName = await fetchContactDisplayName(after.contact_id);
    const { googleEventId } = await syncShowingToGoogle(after, contactName);
    if (googleEventId && googleEventId !== after.google_event_id) {
      await supabaseAdmin
        .from("showings")
        .update({ google_event_id: googleEventId })
        .eq("id", id);
      after.google_event_id = googleEventId;
    }
  }

  return after;
}

export async function deleteShowing(agentId: string, id: string): Promise<boolean> {
  // Read the Google event id BEFORE the row is gone so we can clean up
  // the remote calendar event.
  const { data: before } = await supabaseAdmin
    .from("showings")
    .select("google_event_id")
    .eq("id", id)
    .eq("agent_id", agentId)
    .maybeSingle();
  const googleEventId =
    (before as { google_event_id: string | null } | null)?.google_event_id ?? null;

  const { error, count } = await supabaseAdmin
    .from("showings")
    .delete({ count: "exact" })
    .eq("id", id)
    .eq("agent_id", agentId);
  if (error) throw new Error(error.message);
  const deleted = (count ?? 0) > 0;

  if (deleted && googleEventId) {
    await deleteShowingFromGoogle(agentId, googleEventId);
  }
  return deleted;
}

/**
 * Lightweight contact-name lookup for calendar-event titles. Not part of
 * the public API — just a helper so the sync call sites stay readable.
 */
async function fetchContactDisplayName(contactId: string): Promise<string | null> {
  const { data } = await supabaseAdmin
    .from("contacts")
    .select("first_name, last_name, email, name")
    .eq("id", contactId)
    .maybeSingle();
  const c = data as {
    first_name: string | null;
    last_name: string | null;
    email: string | null;
    name: string | null;
  } | null;
  if (!c) return null;
  const joined = `${c.first_name ?? ""} ${c.last_name ?? ""}`.trim();
  return joined || c.name || c.email || null;
}

// ── Feedback ──────────────────────────────────────────────────────────

export type UpsertFeedbackInput = Partial<{
  rating: number | null;
  overall_reaction: OverallReaction | null;
  pros: string | null;
  cons: string | null;
  notes: string | null;
  would_offer: boolean;
  price_concerns: boolean;
  location_concerns: boolean;
  condition_concerns: boolean;
}>;

export async function upsertShowingFeedback(
  agentId: string,
  showingId: string,
  input: UpsertFeedbackInput,
): Promise<ShowingFeedbackRow> {
  // Verify the showing belongs to the agent before writing feedback.
  // `showing_feedback` has no agent_id directly; the join via
  // `showings.agent_id` is what scopes it.
  const { data: owned } = await supabaseAdmin
    .from("showings")
    .select("id")
    .eq("id", showingId)
    .eq("agent_id", agentId)
    .maybeSingle();
  if (!owned) throw new Error("Showing not found");

  const { data, error } = await supabaseAdmin
    .from("showing_feedback")
    .upsert(
      { showing_id: showingId, ...input, updated_at: new Date().toISOString() },
      { onConflict: "showing_id" },
    )
    .select("*")
    .single();
  if (error || !data) throw new Error(error?.message ?? "Failed to save feedback");
  return data as ShowingFeedbackRow;
}

// ── Roll-ups ──────────────────────────────────────────────────────────

type ShowingFeedbackSummary = { overall_reaction: OverallReaction | null; would_offer: boolean };

/** PostgREST returns an embedded to-one as an array on some relationships. */
function firstFeedback(v: unknown): ShowingFeedbackSummary | null {
  const row = Array.isArray(v) ? v[0] : v;
  return row ? (row as ShowingFeedbackSummary) : null;
}

/**
 * Per-contact showing stats for the Contacts-page badge. Returns a Map
 * keyed by contact_id so callers can render a batch without N+1.
 *
 * Scoped by agent, with the feedback embedded, so it is one round trip and
 * needs no contact ids: the contacts page starts it before it knows which
 * contacts the Smart List will return, instead of queueing two more reads
 * behind that. Pass `contactIds` to narrow the result; omit it for every
 * contact the agent has.
 */
export async function getContactShowingStats(
  agentId: string,
  contactIds?: string[],
): Promise<Map<string, ContactShowingStats>> {
  if (contactIds && contactIds.length === 0) return new Map();

  const { data: rows } = await supabaseAdmin
    .from("showings")
    .select("id, contact_id, status, showing_feedback(overall_reaction, would_offer)")
    .eq("agent_id", agentId);
  const showings = (rows ?? []) as Array<{
    id: string;
    contact_id: string;
    status: ShowingStatus;
    showing_feedback: unknown;
  }>;
  if (showings.length === 0) return new Map();

  const wanted = contactIds ? new Set(contactIds) : null;
  const stats = new Map<string, ContactShowingStats>();
  for (const s of showings) {
    if (wanted && !wanted.has(s.contact_id)) continue;
    const row = stats.get(s.contact_id) ?? {
      total: 0,
      attended: 0,
      scheduled: 0,
      loved: 0,
      wouldOfferCount: 0,
    };
    row.total += 1;
    if (s.status === "attended") row.attended += 1;
    if (s.status === "scheduled") row.scheduled += 1;
    const f = firstFeedback(s.showing_feedback);
    if (f?.overall_reaction === "love") row.loved += 1;
    if (f?.would_offer) row.wouldOfferCount += 1;
    stats.set(s.contact_id, row);
  }
  return stats;
}
