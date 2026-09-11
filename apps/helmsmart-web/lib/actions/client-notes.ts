"use server";

import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { getServerT } from "@/lib/i18n/server";
import { revalidatePath } from "next/cache";
import {
  insertClientNote,
  deleteClientNote as deleteClientNoteKnowledge,
  type NoteKind,
} from "@helm/dna-knowledge";

// NOTE: this is a "use server" module — it may only export async functions.
// NoteKind is re-exported for consumers from @helm/dna-knowledge directly;
// re-exporting the type here makes the SWC server-actions transform emit a
// runtime value export ("ReferenceError: NoteKind is not defined") that breaks
// every action on the page. See client-notes-panel.tsx for the import.

export async function addClientNote(
  clientId: string,
  body: string,
  kind: NoteKind = "note"
): Promise<{ id: string }> {
  const cookieStore = await cookies();
  const orgId = cookieStore.get("helmsmart-org-id")?.value ?? "";
  // The notes panel renders `err.message` verbatim, so this string is copy the
  // owner reads — not an internal code. Server actions run inside a request,
  // so `getServerT` resolves their language here the same way a page does.
  if (!orgId) throw new Error((await getServerT("clients"))("errors.unauthorized"));

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  const { id } = await insertClientNote(supabase, orgId, { clientId, body, kind, authorId: user?.id ?? null });
  revalidatePath(`/clients/${clientId}`);
  return { id };
}

/**
 * Returns a result rather than throwing: the panel removes the note before the
 * delete lands and must put it back, with a reason, if nothing was deleted.
 * Through the RLS client a refused delete matches zero rows without erroring.
 */
export async function deleteClientNote(
  noteId: string,
  clientId: string,
): Promise<{ ok: boolean; error?: string }> {
  const t = await getServerT("clients");
  const cookieStore = await cookies();
  const orgId = cookieStore.get("helmsmart-org-id")?.value ?? "";
  if (!orgId) return { ok: false, error: t("errors.unauthorized") };

  const supabase = await createClient();
  let deleted: number;
  try {
    ({ deleted } = await deleteClientNoteKnowledge(supabase, orgId, noteId));
  } catch (e) {
    console.error("[client-notes] delete failed:", e);
    return { ok: false, error: t("notes.errors.deleteFailed") };
  }
  if (deleted === 0) return { ok: false, error: t("notes.errors.deleteRefused") };

  revalidatePath(`/clients/${clientId}`);
  return { ok: true };
}
