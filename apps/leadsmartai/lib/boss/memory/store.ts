import "server-only";

import { supabaseAdmin } from "@/lib/supabase/admin";
import {
  MEMORY_PROMPT_LIMIT,
  cleanContent,
  isDuplicate,
  memoryPromptBlock,
  type MemoryKind,
  type MemoryNote,
} from "./pure";

/** Active notes for a realtor, newest first. Service-role; callers scope by agentId. */
export async function listMemories(agentId: string, limit = 100): Promise<MemoryNote[]> {
  const { data, error } = await supabaseAdmin
    .from("boss_memories")
    .select("id, content, kind, source, created_at")
    .eq("agent_id", agentId)
    .is("archived_at", null)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data ?? []) as MemoryNote[];
}

export type AddMemoryResult = { status: "added"; note: MemoryNote } | { status: "duplicate" } | { status: "empty" };

/**
 * Save one note unless an equivalent one is already active. Dedupe is by
 * normalised text (see pure.ts), so "remember X" twice yields one row.
 */
export async function addMemory(args: {
  agentId: string;
  content: string;
  kind?: MemoryKind;
  source: "max" | "agent";
  sourceRunId?: string | null;
}): Promise<AddMemoryResult> {
  const content = cleanContent(args.content);
  if (!content) return { status: "empty" };
  const existing = await listMemories(args.agentId, 500);
  if (isDuplicate(content, existing.map((n) => n.content))) return { status: "duplicate" };
  const { data, error } = await supabaseAdmin
    .from("boss_memories")
    .insert({
      agent_id: args.agentId,
      content,
      kind: args.kind ?? "fact",
      source: args.source,
      source_run_id: args.sourceRunId ?? null,
    })
    .select("id, content, kind, source, created_at")
    .single();
  if (error) throw error;
  return { status: "added", note: data as MemoryNote };
}

/** Archive one note by id. False when it was not this realtor's (or already gone). */
export async function archiveMemory(agentId: string, id: string): Promise<boolean> {
  const { data, error } = await supabaseAdmin
    .from("boss_memories")
    .update({ archived_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq("agent_id", agentId)
    .eq("id", id)
    .is("archived_at", null)
    .select("id");
  if (error) throw error;
  return Boolean(data && data.length > 0);
}

/**
 * Archive every active note whose text contains the phrase (case-insensitive).
 * Returns the notes archived so the tool can say what it forgot.
 */
export async function archiveMatching(agentId: string, query: string): Promise<MemoryNote[]> {
  const q = cleanContent(query);
  if (!q) return [];
  const all = await listMemories(agentId, 500);
  const needle = q.toLowerCase();
  const hits = all.filter((n) => n.content.toLowerCase().includes(needle));
  if (hits.length === 0) return [];
  const now = new Date().toISOString();
  const { error } = await supabaseAdmin
    .from("boss_memories")
    .update({ archived_at: now, updated_at: now })
    .eq("agent_id", agentId)
    .in(
      "id",
      hits.map((n) => n.id),
    );
  if (error) throw error;
  return hits;
}

/** The prompt block for buildSystemPrompt. Never throws — memory must not break a run. */
export async function memoryBlockForPrompt(agentId: string): Promise<string> {
  try {
    const notes = await listMemories(agentId, MEMORY_PROMPT_LIMIT);
    return memoryPromptBlock(notes);
  } catch (e) {
    console.warn("[boss-memory] prompt block failed:", e);
    return "";
  }
}
