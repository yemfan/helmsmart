import "server-only";
import { randomUUID } from "crypto";

import { supabaseAdmin } from "@/lib/supabase/admin";
import { generateOpenHouseSlug } from "./slug";
import type { Occurrence } from "./expandOccurrences";
import type {
  OpenHouseListItem,
  OpenHouseRow,
  OpenHouseStatus,
  OpenHouseVisitorRow,
} from "./types";

/**
 * Agent-scoped service for the Open House feature.
 *
 * Visitor creation lives in `publicService.ts` — that path is
 * explicitly unauthenticated (public QR code), so keeping it in a
 * separate module makes the trust boundary obvious.
 */

// ── CREATE ────────────────────────────────────────────────────────────

export type CreateOpenHouseInput = {
  agentId: string;
  propertyAddress: string;
  startAt: string;
  endAt: string;
  transactionId?: string | null;
  city?: string | null;
  state?: string | null;
  zip?: string | null;
  mlsNumber?: string | null;
  mlsUrl?: string | null;
  listPrice?: number | null;
  hostNotes?: string | null;
  ownerName?: string | null;
  ownerEmail?: string | null;
  requestingAgentName?: string | null;
  requestingAgentEmail?: string | null;
};

export async function createOpenHouse(input: CreateOpenHouseInput): Promise<OpenHouseRow> {
  // Retry loop for the (vanishingly unlikely) slug collision. Max 3 tries —
  // if we hit 3 collisions something much weirder is going on.
  for (let attempt = 0; attempt < 3; attempt++) {
    const slug = generateOpenHouseSlug();
    const { data, error } = await supabaseAdmin
      .from("open_houses")
      .insert({
        agent_id: input.agentId,
        transaction_id: input.transactionId ?? null,
        property_address: input.propertyAddress,
        city: input.city ?? null,
        state: input.state ?? null,
        zip: input.zip ?? null,
        mls_number: input.mlsNumber ?? null,
        mls_url: input.mlsUrl ?? null,
        list_price: input.listPrice ?? null,
        start_at: input.startAt,
        end_at: input.endAt,
        signin_slug: slug,
        host_notes: input.hostNotes ?? null,
        owner_name: input.ownerName ?? null,
        owner_email: input.ownerEmail ?? null,
        requesting_agent_name: input.requestingAgentName ?? null,
        requesting_agent_email: input.requestingAgentEmail ?? null,
      })
      .select("*")
      .single();
    if (!error && data) return data as OpenHouseRow;
    const code = (error as { code?: string } | null)?.code;
    // 23505 = unique constraint violation. Retry with a new slug.
    if (code !== "23505") {
      throw new Error(error?.message ?? "Failed to create open house");
    }
  }
  throw new Error("Could not generate a unique sign-in slug after 3 attempts");
}

// ── CREATE (recurring) ────────────────────────────────────────────────

export type CreateRecurringInput = Omit<CreateOpenHouseInput, "startAt" | "endAt"> & {
  occurrences: Occurrence[];
};

/**
 * Creates one row per occurrence, all sharing the same
 * `recurrence_group_id`. Each gets its own slug (and its own public
 * URL + visitor list). We retry slug collisions up to 3x per row.
 *
 * If any insert fails after N successful inserts, we best-effort
 * delete the group so we don't leave half a series lying around.
 */
export async function createRecurringOpenHouses(
  input: CreateRecurringInput,
): Promise<OpenHouseRow[]> {
  if (!input.occurrences.length) {
    throw new Error("No occurrences to create");
  }
  const groupId = randomUUID();
  const created: OpenHouseRow[] = [];
  try {
    for (const occ of input.occurrences) {
      const row = await insertOne({
        input,
        occurrence: occ,
        groupId,
      });
      created.push(row);
    }
    return created;
  } catch (err) {
    // Rollback best-effort — we don't want orphaned half-series.
    if (created.length) {
      await supabaseAdmin
        .from("open_houses")
        .delete()
        .eq("recurrence_group_id", groupId);
    }
    throw err;
  }
}

async function insertOne(args: {
  input: CreateRecurringInput;
  occurrence: Occurrence;
  groupId: string;
}): Promise<OpenHouseRow> {
  const { input, occurrence, groupId } = args;
  for (let attempt = 0; attempt < 3; attempt++) {
    const slug = generateOpenHouseSlug();
    const { data, error } = await supabaseAdmin
      .from("open_houses")
      .insert({
        agent_id: input.agentId,
        transaction_id: input.transactionId ?? null,
        property_address: input.propertyAddress,
        city: input.city ?? null,
        state: input.state ?? null,
        zip: input.zip ?? null,
        mls_number: input.mlsNumber ?? null,
        mls_url: input.mlsUrl ?? null,
        list_price: input.listPrice ?? null,
        start_at: occurrence.startAt,
        end_at: occurrence.endAt,
        signin_slug: slug,
        host_notes: input.hostNotes ?? null,
        recurrence_group_id: groupId,
      })
      .select("*")
      .single();
    if (!error && data) return data as OpenHouseRow;
    const code = (error as { code?: string } | null)?.code;
    if (code !== "23505") {
      throw new Error(error?.message ?? "Failed to create open house");
    }
  }
  throw new Error("Could not generate a unique sign-in slug after 3 attempts");
}

// ── READ ──────────────────────────────────────────────────────────────

export async function listOpenHousesForAgent(
  agentId: string,
): Promise<OpenHouseListItem[]> {
  const { data, error } = await supabaseAdmin
    .from("open_houses")
    .select("*")
    .eq("agent_id", agentId)
    .order("start_at", { ascending: false });
  if (error) throw new Error(error.message);
  const houses = (data ?? []) as OpenHouseRow[];
  if (!houses.length) return [];

  const ids = houses.map((h) => h.id);
  const { data: visitorRows } = await supabaseAdmin
    .from("open_house_visitors")
    .select("open_house_id, timeline, marketing_consent")
    .in("open_house_id", ids);

  const stats = new Map<
    string,
    { total: number; consent: number; hot: number }
  >();
  for (const v of (visitorRows ?? []) as Array<{
    open_house_id: string;
    timeline: string | null;
    marketing_consent: boolean;
  }>) {
    const row = stats.get(v.open_house_id) ?? { total: 0, consent: 0, hot: 0 };
    row.total += 1;
    if (v.marketing_consent) row.consent += 1;
    if (v.timeline === "now") row.hot += 1;
    stats.set(v.open_house_id, row);
  }

  return houses.map((h) => {
    const s = stats.get(h.id) ?? { total: 0, consent: 0, hot: 0 };
    return {
      ...h,
      visitor_total: s.total,
      visitor_with_consent: s.consent,
      visitor_hot: s.hot,
    };
  });
}

export async function getOpenHouseWithVisitors(
  agentId: string,
  id: string,
): Promise<{ openHouse: OpenHouseRow; visitors: OpenHouseVisitorRow[] } | null> {
  const { data: oh, error } = await supabaseAdmin
    .from("open_houses")
    .select("*")
    .eq("id", id)
    .eq("agent_id", agentId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!oh) return null;

  const { data: visitors } = await supabaseAdmin
    .from("open_house_visitors")
    .select("*")
    .eq("open_house_id", id)
    .order("created_at", { ascending: false });

  return {
    openHouse: oh as OpenHouseRow,
    visitors: (visitors ?? []) as OpenHouseVisitorRow[],
  };
}

// ── UPDATE ────────────────────────────────────────────────────────────

export type UpdateOpenHouseInput = Partial<{
  property_address: string;
  city: string | null;
  state: string | null;
  zip: string | null;
  mls_number: string | null;
  mls_url: string | null;
  list_price: number | null;
  start_at: string;
  end_at: string;
  host_notes: string | null;
  status: OpenHouseStatus;
  transaction_id: string | null;
  owner_name: string | null;
  owner_email: string | null;
  requesting_agent_name: string | null;
  requesting_agent_email: string | null;
  host_comment: string | null;
}>;

export async function updateOpenHouse(
  agentId: string,
  id: string,
  input: UpdateOpenHouseInput,
): Promise<OpenHouseRow | null> {
  const patch = { ...input, updated_at: new Date().toISOString() };
  const { data, error } = await supabaseAdmin
    .from("open_houses")
    .update(patch)
    .eq("id", id)
    .eq("agent_id", agentId)
    .select("*")
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data as OpenHouseRow | null) ?? null;
}

/**
 * Marks the given occurrence + all future ones in the same series as
 * cancelled. Past occurrences (start_at < this one's start_at) are
 * left alone — they happened, cancelling them would lose attendance
 * data. Scoped by agent_id so one agent can't cancel another's series.
 *
 * Returns the number of rows updated.
 */
export async function cancelRecurrenceSeries(
  agentId: string,
  occurrenceId: string,
): Promise<{ cancelled: number; groupId: string | null }> {
  const { data: anchor } = await supabaseAdmin
    .from("open_houses")
    .select("recurrence_group_id, start_at")
    .eq("id", occurrenceId)
    .eq("agent_id", agentId)
    .maybeSingle();
  const row = anchor as { recurrence_group_id: string | null; start_at: string } | null;
  if (!row || !row.recurrence_group_id) {
    return { cancelled: 0, groupId: null };
  }
  const { data, error } = await supabaseAdmin
    .from("open_houses")
    .update({ status: "cancelled", updated_at: new Date().toISOString() })
    .eq("agent_id", agentId)
    .eq("recurrence_group_id", row.recurrence_group_id)
    .gte("start_at", row.start_at)
    .neq("status", "completed")
    .select("id");
  if (error) throw new Error(error.message);
  return { cancelled: (data ?? []).length, groupId: row.recurrence_group_id };
}

export async function deleteOpenHouse(agentId: string, id: string): Promise<boolean> {
  const { error, count } = await supabaseAdmin
    .from("open_houses")
    .delete({ count: "exact" })
    .eq("id", id)
    .eq("agent_id", agentId);
  if (error) throw new Error(error.message);
  return (count ?? 0) > 0;
}
