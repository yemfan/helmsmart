import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@helm/data/types";

type Db = SupabaseClient<Database>;

export type NoteKind = "note" | "call" | "meeting" | "email" | "follow_up";

export interface ClientNoteInput {
  clientId: string;
  body: string;
  kind?: NoteKind;
  /** Author user id, if known (nullable for system-generated notes). */
  authorId?: string | null;
}

/**
 * Capture a note against a client. Org-scoped; the caller revalidates.
 * Returns the new row's id, so a panel showing the note before the insert lands
 * can swap its placeholder id for the real one (and delete the real row later).
 */
export async function insertClientNote(
  db: Db,
  orgId: string,
  input: ClientNoteInput
): Promise<{ id: string }> {
  const { data, error } = await db
    .from("client_notes")
    .insert({
      organization_id: orgId,
      client_id: input.clientId,
      author_id: input.authorId ?? null,
      body: input.body.trim(),
      kind: input.kind ?? "note",
    })
    .select("id")
    .single();
  if (error || !data) throw new Error(error?.message ?? "client note insert returned no row");
  return { id: data.id };
}

/**
 * Delete a note. Org-scoped; the caller revalidates.
 *
 * Returns how many rows were removed: through the RLS client a refused delete
 * matches zero rows and is not an error, so `deleted: 0` means the note is
 * still there. Throws on a database error.
 */
export async function deleteClientNote(
  db: Db,
  orgId: string,
  noteId: string
): Promise<{ deleted: number }> {
  const { data, error } = await db
    .from("client_notes")
    .delete()
    .eq("id", noteId)
    .eq("organization_id", orgId)
    .select("id");
  if (error) throw new Error(error.message);
  return { deleted: data?.length ?? 0 };
}
