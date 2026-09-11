import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@helm/data/types";

type Db = SupabaseClient<Database>;

export interface ClientPatch {
  pipeline_stage?: string;
  expected_value?: number | null;
  pipeline_note?: string | null;
  status?: string;
  stage_changed_at?: string;
}

/**
 * Patch a client's pipeline fields. Auto-stamps stage_changed_at when the pipeline
 * stage moves. Org-scoped (RLS-enforced); caller revalidates.
 *
 * Returns how many rows changed. Through the RLS client a refused update is not
 * an error — it matches zero rows — so `updated: 0` is the caller's only signal
 * that nothing was saved. Throws on a database error.
 */
export async function patchClient(
  db: Db,
  orgId: string,
  clientId: string,
  patch: ClientPatch
): Promise<{ updated: number }> {
  const { data, error } = await db
    .from("clients")
    .update({
      ...patch,
      updated_at: new Date().toISOString(),
      ...(patch.pipeline_stage ? { stage_changed_at: new Date().toISOString() } : {}),
    })
    .eq("id", clientId)
    .eq("organization_id", orgId)
    .select("id");
  if (error) throw new Error(error.message);
  return { updated: data?.length ?? 0 };
}

/** Delete a client. Org-scoped (the caller owns auth + revalidation). */
export async function deleteClient(db: Db, orgId: string, clientId: string): Promise<void> {
  const { error } = await db
    .from("clients")
    .delete()
    .eq("id", clientId)
    .eq("organization_id", orgId);
  if (error) throw new Error(error.message);
}
