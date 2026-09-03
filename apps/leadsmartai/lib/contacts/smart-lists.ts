import "server-only";

import { supabaseAdmin } from "@/lib/supabase/admin";
import type { ContactFilterConfig, SmartList } from "./types";

function mapSmartListRow(row: Record<string, unknown>): SmartList {
  const rawFilter = row.filter_config;
  const filterConfig: ContactFilterConfig =
    rawFilter && typeof rawFilter === "object"
      ? (rawFilter as ContactFilterConfig)
      : {};
  return {
    id: String(row.id),
    agentId: String(row.agent_id),
    name: String(row.name ?? ""),
    description: (row.description as string | null) ?? null,
    icon: (row.icon as string | null) ?? null,
    filterConfig,
    sortOrder: Number(row.sort_order ?? 0),
    isDefault: !!row.is_default,
    isHidden: !!row.is_hidden,
    createdAt: String(row.created_at ?? new Date().toISOString()),
    updatedAt: String(row.updated_at ?? new Date().toISOString()),
  };
}

/**
 * Thrown when the smart_lists table is not in the database.
 *
 * listSmartLists already swallowed this condition and returned [], so the read
 * path degraded quietly and the page rendered its three seeded defaults. The
 * write path did not, so "Add" threw the raw PostgREST error and the route
 * turned it into a 500 — a feature that looks alive until you use it. Naming
 * the condition lets the route answer with something true.
 */
export class SmartListsUnavailableError extends Error {
  constructor() {
    super("smart_lists table is not present in this database");
    this.name = "SmartListsUnavailableError";
  }
}

function isMissingRelationError(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const e = err as { code?: string; message?: string };
  return (
    e.code === "42P01" ||
    e.code === "42703" ||
    /does not exist|schema cache/i.test(e.message ?? "")
  );
}

/**
 * List an agent's Smart Lists. Includes hidden ones so the settings UI
 * can show and unhide them. Filter `isHidden` client-side for display.
 */
export async function listSmartLists(agentId: string): Promise<SmartList[]> {
  const { data, error } = await supabaseAdmin
    .from("smart_lists")
    .select("*")
    .eq("agent_id", agentId as never)
    .order("sort_order", { ascending: true });
  if (error) {
    if (isMissingRelationError(error)) return [];
    throw error;
  }
  return (data ?? []).map((r) => mapSmartListRow(r as Record<string, unknown>));
}

export async function getSmartList(
  agentId: string,
  listId: string,
): Promise<SmartList | null> {
  const { data, error } = await supabaseAdmin
    .from("smart_lists")
    .select("*")
    .eq("agent_id", agentId as never)
    .eq("id", listId)
    .maybeSingle();
  if (error && !isMissingRelationError(error)) throw error;
  if (!data) return null;
  return mapSmartListRow(data as Record<string, unknown>);
}

export type CreateSmartListInput = {
  name: string;
  description?: string | null;
  icon?: string | null;
  filterConfig: ContactFilterConfig;
  sortOrder?: number;
};

export async function createSmartList(
  agentId: string,
  input: CreateSmartListInput,
): Promise<SmartList> {
  const { data, error } = await supabaseAdmin
    .from("smart_lists")
    .insert({
      agent_id: agentId,
      name: input.name.trim().slice(0, 80),
      description: input.description ?? null,
      icon: input.icon ?? null,
      filter_config: input.filterConfig as never,
      sort_order: input.sortOrder ?? 100,
      is_default: false,
      is_hidden: false,
    } as never)
    .select("*")
    .single();
  if (error) {
    if (isMissingRelationError(error)) throw new SmartListsUnavailableError();
    throw error;
  }
  return mapSmartListRow(data as Record<string, unknown>);
}

export type UpdateSmartListInput = {
  name?: string;
  description?: string | null;
  icon?: string | null;
  filterConfig?: ContactFilterConfig;
  sortOrder?: number;
  isHidden?: boolean;
};

export async function updateSmartList(
  agentId: string,
  listId: string,
  patch: UpdateSmartListInput,
): Promise<SmartList> {
  const row: Record<string, unknown> = {};
  if (patch.name !== undefined) row.name = patch.name.trim().slice(0, 80);
  if (patch.description !== undefined) row.description = patch.description;
  if (patch.icon !== undefined) row.icon = patch.icon;
  if (patch.filterConfig !== undefined) row.filter_config = patch.filterConfig;
  if (patch.sortOrder !== undefined) row.sort_order = patch.sortOrder;
  if (patch.isHidden !== undefined) row.is_hidden = patch.isHidden;

  const { data, error } = await supabaseAdmin
    .from("smart_lists")
    .update(row as never)
    .eq("id", listId)
    .eq("agent_id", agentId as never)
    .select("*")
    .single();
  if (error) {
    if (isMissingRelationError(error)) throw new SmartListsUnavailableError();
    throw error;
  }
  return mapSmartListRow(data as Record<string, unknown>);
}

/**
 * Delete a Smart List. Default lists (seeded Leads/Sphere/All) cannot be
 * deleted — only hidden via `updateSmartList({ isHidden: true })`. Throws
 * if the caller tries to delete a default list.
 */
export async function deleteSmartList(
  agentId: string,
  listId: string,
): Promise<void> {
  const existing = await getSmartList(agentId, listId);
  if (!existing) return;
  if (existing.isDefault) {
    throw new Error(
      "Default Smart Lists cannot be deleted. Hide them instead.",
    );
  }
  const { error } = await supabaseAdmin
    .from("smart_lists")
    .delete()
    .eq("id", listId)
    .eq("agent_id", agentId as never);
  if (error) throw error;
}
