"use server";

import { revalidatePath } from "next/cache";

import { getMemberOrgId } from "@/lib/auth/org-context";
import { createClient } from "@/lib/supabase/server";
import { getServerT } from "@/lib/i18n/server";
import { UNDEFINED_COLUMN, updateOrg } from "@/lib/actions/org-update";
import { activationState } from "@/lib/activation";
import { loadActivationFacts } from "@/lib/activation-facts";
import { PROFILE_TITLE, isEmptyProfile, renderProfile, type BusinessProfile } from "@/lib/business-profile";
import { draftReceptionist, type ReceptionistDraft } from "@/lib/receptionist-draft";
import { recordSetupProgress } from "@/lib/workforce-attribution";

/**
 * The guided setup's own server work. Everything that SAVES goes through an
 * action that already existed — `saveVoiceSettings`, `saveBusinessHours`,
 * `upsertAppointmentType`, `upsertKnowledgeEntry`, `saveTwilioNumber` — so the
 * wizard and Settings → Voice AI write the same columns through the same
 * row-checked code and can never drift apart. What is here is only what had no
 * home: the draft, the business-profile write, the "has a call arrived yet?"
 * poll, and the progress note.
 */

type BasicsInput = BusinessProfile;

/**
 * Draft Emma's briefing from the website (or the description, or defaults).
 *
 * Returns the draft and never an error: the step must not be blocked by a site
 * that will not load, so the failure travels as `siteFailure` and the screen
 * says what happened while the owner edits the thinner draft.
 */
export async function draftReceptionistSetup(): Promise<{ draft: ReceptionistDraft } | { error: string }> {
  const t = await getServerT("auth");
  const orgId = await getMemberOrgId();
  if (!orgId) return { error: t("setup.errors.noOrganization") };

  const supabase = await createClient();
  // The name on its own — a select that also asked for `website` would fail
  // entirely wherever that column is still missing, and the draft would lose
  // the business name too.
  const [{ data: named }, read] = await Promise.all([
    supabase.from("organizations").select("name").eq("id", orgId).maybeSingle(),
    loadActivationFacts(orgId),
  ]);

  const profile = read?.profile;
  const draft = await draftReceptionist({
    businessName: ((named as { name?: string | null } | null)?.name as string | null) ?? "",
    website: profile?.website || null,
    description: profile?.description || null,
    category: profile?.category || null,
    location: profile?.location || null,
  });
  return { draft };
}

/**
 * The business basics, saved — into the columns where they exist, and into the
 * `knowledge_base` mirror either way.
 *
 * `createOrg` writes these best-effort and throws the result away, so a refused
 * write there is indistinguishable from a successful one. Here the column write
 * goes through `updateOrg`, which asks for the rows back, and is then read:
 *
 *   - `42703` — the migration is not applied (which is the case on Core today).
 *     Not the owner's problem and not a refusal, so it is logged and the mirror
 *     carries the profile instead. The step still works and still feeds the
 *     draft, which is the whole reason to ask for a website at all.
 *   - anything else — a real failure. The owner is told, and nothing claims to
 *     have saved.
 *
 * The mirror is written on both paths, because the content generator and the
 * receptionist read `knowledge_base`: leaving a stale copy behind would have
 * the AI speaking from the description the owner just replaced.
 */
export async function saveBusinessBasics(input: BasicsInput): Promise<{ ok: true } | { ok: false; error: string }> {
  const t = await getServerT("auth");
  const orgId = await getMemberOrgId();
  if (!orgId) return { ok: false, error: t("setup.errors.noOrganization") };

  const profile: BusinessProfile = {
    website: input.website.trim(),
    category: input.category.trim(),
    location: input.location.trim(),
    description: input.description.trim(),
  };

  const saved = await updateOrg(
    orgId,
    {
      website: profile.website || null,
      business_category: profile.category || null,
      business_location: profile.location || null,
      business_description: profile.description || null,
    },
    "setup.saveBusinessBasics",
  );
  if (!saved.ok && saved.code !== UNDEFINED_COLUMN) return { ok: false, error: saved.error };
  if (!saved.ok) {
    console.warn(
      "[setup] business-profile columns are missing — apply migrations 00085/00086; " +
        "the profile is being kept in the knowledge_base mirror meanwhile",
    );
  }

  const supabase = await createClient();
  const { data: existing } = await supabase
    .from("knowledge_base")
    .select("id")
    .eq("organization_id", orgId)
    .eq("title", PROFILE_TITLE)
    .limit(1)
    .maybeSingle();

  let mirrored = false;
  if (!isEmptyProfile(profile)) {
    const content = renderProfile(profile);
    const { data, error } = existing
      ? await supabase
          .from("knowledge_base")
          .update({ content })
          .eq("id", existing.id)
          .eq("organization_id", orgId)
          .select("id")
      : await supabase
          .from("knowledge_base")
          .insert({ organization_id: orgId, title: PROFILE_TITLE, content, sort: 0 })
          .select("id");
    if (error) console.error("[setup] knowledge_base profile mirror failed:", error.message);
    mirrored = !error && (data?.length ?? 0) > 0;

    // With the columns gone, the mirror is not a mirror — it is the record. A
    // step that saved nowhere must not report success.
    if (!saved.ok && !mirrored) return { ok: false, error: t("setup.errors.saveFailed") };
  }

  revalidatePath("/setup");
  revalidatePath("/home");
  revalidatePath("/settings");
  await noteProgress(orgId);
  return { ok: true };
}

export type FirstCall = {
  arrived: boolean;
  /** ISO timestamp of the first inbound call, when there is one. */
  at: string | null;
  fromNumber: string | null;
};

/**
 * Has a call actually come in yet?
 *
 * `/voice` is a plain server component that only refreshes on navigation, so
 * "watch your test call arrive" needs its own answer. This is it: the earliest
 * inbound `voice_sessions` row for the org, polled by the last setup step and
 * read again by the checklist on /home. A row that exists is the only proof
 * this app has that the receptionist answered, which is exactly why it is the
 * thing being waited on.
 */
export async function pollFirstCall(): Promise<FirstCall> {
  const orgId = await getMemberOrgId();
  if (!orgId) return { arrived: false, at: null, fromNumber: null };

  const supabase = await createClient();
  const { data } = await supabase
    .from("voice_sessions")
    .select("created_at, from_number")
    .eq("organization_id", orgId)
    .eq("direction", "inbound")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!data) return { arrived: false, at: null, fromNumber: null };
  const from = (data.from_number as string | null) ?? null;
  return {
    arrived: true,
    at: (data.created_at as string | null) ?? null,
    fromNumber: from && from !== "unknown" ? from : null,
  };
}

/**
 * Note how far this org has got, as a number the Command Center can already
 * read. No new table and no migration: `ai_employee_metrics` exists, and
 * `recordMetric` sets an exact value, so re-noting the same progress is a
 * no-op rather than a double count. Best-effort — an org that never seeded its
 * workforce records nothing and notices nothing.
 */
async function noteProgress(orgId: string): Promise<void> {
  const read = await loadActivationFacts(orgId);
  if (!read) return;
  const supabase = await createClient();
  await recordSetupProgress(supabase, orgId, activationState(read.facts).done);
}

/** Called by the wizard after a step saved through one of the shared actions. */
export async function noteSetupProgress(): Promise<void> {
  const orgId = await getMemberOrgId();
  if (!orgId) return;
  await noteProgress(orgId);
  revalidatePath("/home");
}
