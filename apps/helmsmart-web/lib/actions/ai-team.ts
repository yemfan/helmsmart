"use server";

/**
 * What the owner can change about a teammate from `/ai-team`.
 *
 * Today that is the autonomy dial. Changing how much rope an AI employee has
 * is a decision about the whole business, so it needs `team.manage` — owner or
 * admin — the same bar as inviting a colleague.
 *
 * Every write proves a row moved (`lib/ai-team/autonomy.ts`), and every
 * refusal comes back as a sentence in the reader's language for the control to
 * show beneath itself.
 */
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireOrgMember } from "@/lib/auth/org-context";
import { checkActionPermission } from "@/components/role-guard";
import { getServerT } from "@/lib/i18n/server";
import { ALL_ACTIONS } from "@/lib/ai-team/registry";
import {
  dialOwners,
  isAutonomyLevel,
  levelsFor,
  setStoredAutonomy,
  type AutonomyLevel,
} from "@/lib/ai-team/autonomy";

export type SaveAutonomyResult =
  | { ok: true; level: AutonomyLevel; activated: boolean }
  | { ok: false; error: string };

export async function setEmployeeAutonomyAction(
  slug: string,
  level: string,
): Promise<SaveAutonomyResult> {
  const t = await getServerT("home");

  const access = await requireOrgMember();
  if (!access.ok) return { ok: false, error: access.error };

  const denied = await checkActionPermission("team.manage");
  if (denied) return { ok: false, error: denied.error };

  // The level has to be one this teammate is actually offered — anything
  // exported from a `"use server"` module is callable with any arguments.
  if (!isAutonomyLevel(level) || !levelsFor(slug, dialOwners(ALL_ACTIONS)).includes(level)) {
    return { ok: false, error: t("aiTeam.errors.invalidLevel") };
  }

  const supabase = await createClient();
  const saved = await setStoredAutonomy(supabase, access.orgId, slug, level);
  if (!saved.ok) {
    return {
      ok: false,
      error: saved.reason === "not_found" ? t("aiTeam.errors.notSeeded") : t("aiTeam.errors.saveFailed"),
    };
  }

  revalidatePath("/ai-team");
  return { ok: true, level: saved.level, activated: saved.activated };
}
