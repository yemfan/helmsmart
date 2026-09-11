// Mark's face on the Ask Mark panel, its launcher and the sidebar button — the
// same one the Command Center board shows for him.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@helm/data/types";
import { getBlueprint, getEmployee } from "@helm/ai-workforce";
import { defaultAvatarForSeed } from "@helm/ui";

type Db = SupabaseClient<Database>;

const MARK = "mark";

/** Mark's roster default — what an org that never picked one (or never seeded) sees. */
export function markDefaultAvatar(): string {
  return getBlueprint(MARK)?.avatar ?? defaultAvatarForSeed(MARK);
}

/**
 * The avatar the business chose for Mark → the roster default. The same order
 * as `app/(dashboard)/command-center/page.tsx`. Never throws: every dashboard
 * page renders through the layout that calls this, so a failed read falls back
 * to the default rather than taking the page down.
 */
export async function markAvatarId(db: Db, orgId: string): Promise<string> {
  const fallback = markDefaultAvatar();
  if (!orgId) return fallback;
  try {
    const mark = await getEmployee(db, orgId, MARK);
    return mark?.avatar ?? fallback;
  } catch (e) {
    console.error("[ask-mark] reading Mark's avatar failed:", e);
    return fallback;
  }
}
