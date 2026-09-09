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
) {
  const cookieStore = await cookies();
  const orgId = cookieStore.get("helmsmart-org-id")?.value ?? "";
  // The notes panel renders `err.message` verbatim, so this string is copy the
  // owner reads — not an internal code. Server actions run inside a request,
  // so `getServerT` resolves their language here the same way a page does.
  if (!orgId) throw new Error((await getServerT("clients"))("errors.unauthorized"));

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  await insertClientNote(supabase, orgId, { clientId, body, kind, authorId: user?.id ?? null });
  revalidatePath(`/clients/${clientId}`);
}

export async function deleteClientNote(noteId: string, clientId: string) {
  const cookieStore = await cookies();
  const orgId = cookieStore.get("helmsmart-org-id")?.value ?? "";
  // The notes panel renders `err.message` verbatim, so this string is copy the
  // owner reads — not an internal code. Server actions run inside a request,
  // so `getServerT` resolves their language here the same way a page does.
  if (!orgId) throw new Error((await getServerT("clients"))("errors.unauthorized"));

  const supabase = await createClient();
  await deleteClientNoteKnowledge(supabase, orgId, noteId);
  revalidatePath(`/clients/${clientId}`);
}
