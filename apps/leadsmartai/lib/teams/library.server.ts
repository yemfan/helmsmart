import "server-only";

import { supabaseAdmin } from "@/lib/supabase/admin";
import { LIBRARY_MAX_ITEMS, type LibraryInput, type LibraryItem } from "./library";

type Row = { id: string; kind: LibraryItem["kind"]; title: string; body: string | null; media_url: string | null; created_by_agent_id: unknown; created_at: string };

function toItem(r: Row): LibraryItem {
  return { id: r.id, kind: r.kind, title: r.title, body: r.body, mediaUrl: r.media_url, createdBy: String(r.created_by_agent_id), createdAt: r.created_at };
}

export async function listLibrary(teamId: string): Promise<LibraryItem[]> {
  try {
    const { data } = await supabaseAdmin
      .from("team_library_items")
      .select("id, kind, title, body, media_url, created_by_agent_id, created_at")
      .eq("team_id", teamId)
      .order("created_at", { ascending: false })
      .limit(LIBRARY_MAX_ITEMS);
    return ((data as Row[] | null) ?? []).map(toItem);
  } catch (e) {
    console.warn("[teams.library] list failed:", e instanceof Error ? e.message : e);
    return [];
  }
}

export async function addLibraryItem(teamId: string, byAgentId: string, item: LibraryInput): Promise<LibraryItem> {
  const { count } = await supabaseAdmin.from("team_library_items").select("id", { count: "exact", head: true }).eq("team_id", teamId);
  if ((count ?? 0) >= LIBRARY_MAX_ITEMS) throw new Error("library_full");
  const { data, error } = await supabaseAdmin
    .from("team_library_items")
    .insert({ team_id: teamId, kind: item.kind, title: item.title, body: item.body, media_url: item.mediaUrl, created_by_agent_id: byAgentId } as never)
    .select("id, kind, title, body, media_url, created_by_agent_id, created_at")
    .single();
  if (error) throw new Error(error.message);
  return toItem(data as Row);
}

export async function removeLibraryItem(teamId: string, id: string): Promise<boolean> {
  const { data, error } = await supabaseAdmin.from("team_library_items").delete().eq("team_id", teamId).eq("id", id).select("id");
  if (error) throw new Error(error.message);
  return Array.isArray(data) && data.length > 0;
}
