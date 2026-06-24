import "server-only";

import { supabaseAdmin } from "@/lib/supabase/admin";
import type { HouseSearchResult } from "./types";

/**
 * Saved AI House Searches — CRUD over contact_house_searches (+ its run
 * history in contact_house_search_runs). Every read/write is scoped to the
 * owning agent: the route passes the agent context down and we re-verify the
 * contact / search belongs to that agent before any write. Mirrors
 * lib/contacts/savedSearches.ts.
 *
 * Run history: refining/re-running a saved search APPENDS a run (a snapshot of
 * that run's HouseSearchResult) rather than overwriting, so the evolution is
 * preserved. The latest run is the current view.
 */

export type SavedHouseSearchRunTrigger = "manual" | "refine" | "auto";

export type SavedHouseSearchRun = {
  id: string;
  refinements: string[];
  result: HouseSearchResult;
  listingCount: number;
  trigger: SavedHouseSearchRunTrigger;
  createdAt: string;
};

export type SavedHouseSearch = {
  id: string;
  contactId: string;
  agentId: string;
  name: string;
  query: string;
  isActive: boolean;
  autoRun: boolean;
  autoRunFrequency: string | null;
  createdAt: string;
  updatedAt: string;
  /** Lightweight summary of the most recent run (list views). */
  latestRun?: { id: string; listingCount: number; createdAt: string } | null;
  runCount?: number;
};

function mapSearch(row: Record<string, unknown>): SavedHouseSearch {
  return {
    id: String(row.id),
    contactId: String(row.contact_id),
    agentId: String(row.agent_id),
    name: String(row.name ?? ""),
    query: String(row.query ?? ""),
    isActive: row.is_active !== false,
    autoRun: row.auto_run === true,
    autoRunFrequency: (row.auto_run_frequency as string | null) ?? null,
    createdAt: String(row.created_at ?? ""),
    updatedAt: String(row.updated_at ?? ""),
  };
}

function mapRun(row: Record<string, unknown>): SavedHouseSearchRun {
  return {
    id: String(row.id),
    refinements: Array.isArray(row.refinements) ? (row.refinements as string[]) : [],
    result: row.result as HouseSearchResult,
    listingCount: Number(row.listing_count ?? 0),
    trigger: ((row.trigger as string) ?? "manual") as SavedHouseSearchRunTrigger,
    createdAt: String(row.created_at ?? ""),
  };
}

async function assertContactBelongsToAgent(agentId: string, contactId: string): Promise<void> {
  const { data } = await supabaseAdmin
    .from("contacts")
    .select("id")
    .eq("id", contactId)
    .eq("agent_id", agentId as never)
    .maybeSingle();
  if (!data) throw new Error("Contact does not belong to this agent");
}

async function assertSearchBelongsToAgent(agentId: string, searchId: string): Promise<void> {
  const { data } = await supabaseAdmin
    .from("contact_house_searches")
    .select("id, agent_id")
    .eq("id", searchId)
    .maybeSingle();
  if (!data) throw new Error("Saved search not found");
  if (String((data as { agent_id: unknown }).agent_id) !== String(agentId)) {
    throw new Error("Saved search does not belong to this agent");
  }
}

export type CreateSavedHouseSearchInput = {
  contactId: string;
  name: string;
  query: string;
  refinements: string[];
  result: HouseSearchResult;
};

/** Create a saved search seeded with its first (manual) run. */
export async function createSavedHouseSearch(
  agentId: string,
  input: CreateSavedHouseSearchInput,
): Promise<SavedHouseSearch> {
  await assertContactBelongsToAgent(agentId, input.contactId);
  const name = input.name.trim().slice(0, 120);
  if (!name) throw new Error("name required");
  const query = input.query.trim();
  if (!query) throw new Error("query required");

  const { data, error } = await supabaseAdmin
    .from("contact_house_searches")
    .insert({ contact_id: input.contactId, agent_id: agentId as never, name, query } as never)
    .select("*")
    .single();
  if (error) throw error;
  const search = mapSearch(data as Record<string, unknown>);

  await insertRun(search.id, {
    refinements: input.refinements,
    result: input.result,
    trigger: "manual",
  });
  // Behavioral signal — reuse the existing saved_search_created weight.
  try {
    await supabaseAdmin.from("contact_events").insert({
      contact_id: input.contactId,
      agent_id: agentId as never,
      event_type: "saved_search_created",
      source: "system",
      payload: { saved_house_search_id: search.id, name, query } as never,
    } as never);
  } catch {
    /* best-effort */
  }
  return search;
}

async function insertRun(
  searchId: string,
  run: { refinements: string[]; result: HouseSearchResult; trigger: SavedHouseSearchRunTrigger },
): Promise<SavedHouseSearchRun> {
  const { data, error } = await supabaseAdmin
    .from("contact_house_search_runs")
    .insert({
      search_id: searchId,
      refinements: (run.refinements ?? []) as never,
      result: run.result as never,
      listing_count: run.result?.listings?.length ?? 0,
      trigger: run.trigger,
    } as never)
    .select("*")
    .single();
  if (error) throw error;
  // Touch the parent so list ordering reflects recent activity.
  await supabaseAdmin
    .from("contact_house_searches")
    .update({ updated_at: new Date().toISOString() } as never)
    .eq("id", searchId);
  return mapRun(data as Record<string, unknown>);
}

/** Append a run to an existing saved search (refine / re-run). */
export async function addSavedHouseSearchRun(
  agentId: string,
  searchId: string,
  run: { refinements: string[]; result: HouseSearchResult; trigger?: SavedHouseSearchRunTrigger },
): Promise<SavedHouseSearchRun> {
  await assertSearchBelongsToAgent(agentId, searchId);
  return insertRun(searchId, {
    refinements: run.refinements,
    result: run.result,
    trigger: run.trigger ?? "refine",
  });
}

export async function listSavedHouseSearches(
  agentId: string,
  opts: { contactId?: string; includeArchived?: boolean } = {},
): Promise<SavedHouseSearch[]> {
  let q = supabaseAdmin
    .from("contact_house_searches")
    .select("*")
    .eq("agent_id", agentId as never)
    .order("updated_at", { ascending: false });
  if (opts.contactId) q = q.eq("contact_id", opts.contactId);
  if (!opts.includeArchived) q = q.eq("is_active", true as never);
  const { data, error } = await q;
  if (error) throw error;
  const searches = (data ?? []).map((r) => mapSearch(r as Record<string, unknown>));
  if (searches.length === 0) return [];

  // Attach a lightweight latest-run summary + run count per search.
  const ids = searches.map((s) => s.id);
  const { data: runRows } = await supabaseAdmin
    .from("contact_house_search_runs")
    .select("id, search_id, listing_count, created_at")
    .in("search_id", ids)
    .order("created_at", { ascending: false });
  const bySearch = new Map<string, { id: string; listingCount: number; createdAt: string }[]>();
  for (const r of (runRows ?? []) as Record<string, unknown>[]) {
    const sid = String(r.search_id);
    const arr = bySearch.get(sid) ?? [];
    arr.push({ id: String(r.id), listingCount: Number(r.listing_count ?? 0), createdAt: String(r.created_at ?? "") });
    bySearch.set(sid, arr);
  }
  for (const s of searches) {
    const runs = bySearch.get(s.id) ?? [];
    s.runCount = runs.length;
    s.latestRun = runs[0] ?? null;
  }
  return searches;
}

export async function getSavedHouseSearch(
  agentId: string,
  searchId: string,
): Promise<{ search: SavedHouseSearch; runs: SavedHouseSearchRun[] } | null> {
  await assertSearchBelongsToAgent(agentId, searchId);
  const { data } = await supabaseAdmin
    .from("contact_house_searches")
    .select("*")
    .eq("id", searchId)
    .maybeSingle();
  if (!data) return null;
  const search = mapSearch(data as Record<string, unknown>);
  const { data: runRows } = await supabaseAdmin
    .from("contact_house_search_runs")
    .select("*")
    .eq("search_id", searchId)
    .order("created_at", { ascending: false });
  const runs = (runRows ?? []).map((r) => mapRun(r as Record<string, unknown>));
  search.runCount = runs.length;
  search.latestRun = runs[0]
    ? { id: runs[0].id, listingCount: runs[0].listingCount, createdAt: runs[0].createdAt }
    : null;
  return { search, runs };
}

export type UpdateSavedHouseSearchInput = {
  name?: string;
  isActive?: boolean;
  /** Agent-requested auto-run (execution cron is a follow-up). */
  autoRun?: boolean;
  autoRunFrequency?: string | null;
};

export async function updateSavedHouseSearch(
  agentId: string,
  searchId: string,
  patch: UpdateSavedHouseSearchInput,
): Promise<SavedHouseSearch> {
  await assertSearchBelongsToAgent(agentId, searchId);
  const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (patch.name !== undefined) {
    const trimmed = patch.name.trim().slice(0, 120);
    if (!trimmed) throw new Error("name cannot be empty");
    update.name = trimmed;
  }
  if (patch.isActive !== undefined) update.is_active = patch.isActive;
  if (patch.autoRun !== undefined) update.auto_run = patch.autoRun;
  if (patch.autoRunFrequency !== undefined) update.auto_run_frequency = patch.autoRunFrequency;

  const { data, error } = await supabaseAdmin
    .from("contact_house_searches")
    .update(update as never)
    .eq("id", searchId)
    .select("*")
    .single();
  if (error) throw error;
  return mapSearch(data as Record<string, unknown>);
}

export async function archiveSavedHouseSearch(agentId: string, searchId: string): Promise<void> {
  await assertSearchBelongsToAgent(agentId, searchId);
  const { error } = await supabaseAdmin
    .from("contact_house_searches")
    .update({ is_active: false, updated_at: new Date().toISOString() } as never)
    .eq("id", searchId);
  if (error) throw error;
}
