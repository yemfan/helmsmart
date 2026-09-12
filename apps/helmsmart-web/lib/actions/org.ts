"use server";

import { randomUUID } from "node:crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { updateOrg } from "@/lib/actions/org-update";
import {
  PROFILE_TITLE,
  isEmptyProfile,
  renderProfile,
  type BusinessProfile,
} from "@/lib/business-profile";
import { getServerT } from "@/lib/i18n/server";
import { getAccountsForEntityType } from "@/lib/data/chart-of-accounts-seed";

export type OrgState = { error: string } | null;

// Business structures that existed BEFORE migration 00085 widened the CHECK to
// add 'nonprofit'. We insert with one of these (always valid) and set a newer
// value best-effort, so onboarding can't break if 00085 hasn't been applied yet.
const LEGACY_ENTITY_TYPES = new Set([
  "sole_prop",
  "llc",
  "s_corp",
  "c_corp",
  "partnership",
]);

/** Slugify a business name: lowercase, hyphens only. */
function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

const ORG_COOKIE = "helmsmart-org-id";
const COOKIE_OPTS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  maxAge: 60 * 60 * 24 * 365, // 1 year
  path: "/",
} as const;

/**
 * Create a new organization for the authenticated user.
 * Seeds the chart of accounts based on entity type.
 * Sets the helmsmart-org-id cookie so middleware can route without a DB call.
 */
export async function createOrg(
  _: OrgState,
  formData: FormData
): Promise<OrgState> {
  const name = (formData.get("name") as string)?.trim();
  const entityType = formData.get("entity_type") as string;
  const website = (formData.get("website") as string)?.trim() || null;
  const businessCategory = (formData.get("business_category") as string)?.trim() || null;
  const businessDescription = (formData.get("business_description") as string)?.trim() || null;
  const businessLocation = (formData.get("business_location") as string)?.trim() || null;

  const t = await getServerT("settings");
  if (!name) return { error: t("errors.businessNameRequired") };
  if (!entityType) return { error: t("org.errors.structureRequired") };

  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) redirect("/login");

  // If user already has an org, just set the cookie and redirect
  const { data: existing } = await supabase
    .from("organization_members")
    .select("organization_id")
    .eq("user_id", user.id)
    .limit(1)
    .maybeSingle();

  if (existing) {
    const cookieStore = await cookies();
    cookieStore.set(ORG_COOKIE, existing.organization_id, COOKIE_OPTS);
    redirect("/home");
  }

  // Create the org, membership, and chart of accounts with the RLS client (NOT
  // the service role) so they all land in the SAME project the user authenticated
  // against — the medical project on medical/doctor hosts, else Core. RLS permits
  // it: "authenticated users can create orgs", users self-insert their membership,
  // and the new owner may seed accounts. The id is generated client-side so the
  // org INSERT needs no RETURNING (which RLS blocks until the membership exists).
  const orgId = randomUUID();

  // Insert with a pre-00085 entity type so the row always satisfies the CHECK,
  // even if the migration adding 'nonprofit' hasn't run yet. The real value +
  // website are applied best-effort below (once the owner membership exists).
  const insertEntityType = LEGACY_ENTITY_TYPES.has(entityType)
    ? entityType
    : "sole_prop";

  const { error: orgError } = await supabase.from("organizations").insert({
    id: orgId,
    name,
    slug: `${slugify(name)}-${Date.now()}`,
    entity_type: insertEntityType,
  });

  if (orgError) {
    console.error("createOrg error:", orgError);
    return { error: t("org.errors.createFailed") };
  }

  // Add the user as owner
  const { error: memberError } = await supabase.from("organization_members").insert({
    organization_id: orgId,
    user_id: user.id,
    role: "owner",
  });

  if (memberError) {
    console.error("createOrg membership error:", memberError);
    return { error: t("org.errors.membershipFailed") };
  }

  // Persist the onboarding details that depend on migration 00085 — the
  // 'nonprofit' entity type and the `website` column. Done AFTER membership (so
  // the owner UPDATE policy applies) and best-effort + isolated: a not-yet-run
  // migration only means these persist later, never that a signup fails.
  //
  // Each goes through `updateOrg`, which asks for the rows back. Discarding
  // the result made a refused write indistinguishable from a successful one,
  // which mattered most for `website`: it is now READ — the guided setup
  // drafts Emma's briefing from it — so a website that silently failed to save
  // would show up later as a setup step that had nothing to work with and no
  // explanation. Still best-effort and still isolated: a not-yet-run migration
  // means these persist later, never that a signup fails.
  if (entityType !== insertEntityType) {
    const res = await updateOrg(orgId, { entity_type: entityType }, "createOrg:entityType");
    if (!res.ok) {
      console.error("createOrg: could not set entity_type (is migration 00085 applied?):", res.error);
    }
  }
  if (website) {
    const res = await updateOrg(orgId, { website }, "createOrg:website");
    if (!res.ok) {
      console.error("createOrg: could not save website (is migration 00085 applied?):", res.error);
    }
  }

  // Business-profile fields (migration 00086). Isolated from the website update
  // so each persists independently once its migration lands; best-effort.
  const columns: Record<string, string> = {};
  if (businessCategory) columns.business_category = businessCategory;
  if (businessDescription) columns.business_description = businessDescription;
  if (businessLocation) columns.business_location = businessLocation;
  if (Object.keys(columns).length > 0) {
    const res = await updateOrg(orgId, columns, "createOrg:businessProfile");
    if (!res.ok) {
      console.error(
        "createOrg: could not save business profile (is migration 00086 applied?):",
        res.error,
      );
    }
  }

  /*
   * Mirror the profile into knowledge_base.
   *
   * This used to run only when one of the 00086 columns was filled in, and it
   * left the WEBSITE out — which on Core, where none of those columns exist,
   * meant the website a new owner typed was written precisely nowhere. It is
   * the one field the guided setup reads, so it is now part of the mirror and
   * the mirror is written whenever there is anything to say. Non-fatal: an org
   * with no profile is a thinner first draft, not a failed signup.
   */
  const profile: BusinessProfile = {
    website: website ?? "",
    category: businessCategory ?? "",
    location: businessLocation ?? "",
    description: businessDescription ?? "",
  };
  if (!isEmptyProfile(profile)) {
    const { error: kbErr } = await supabase.from("knowledge_base").insert({
      organization_id: orgId,
      title: PROFILE_TITLE,
      content: renderProfile(profile),
      sort: 0,
    });
    if (kbErr) {
      console.error("createOrg: could not seed knowledge_base profile:", kbErr.message);
    }
  }

  // Seed chart of accounts (the user is now owner, so RLS permits the insert)
  const accounts = getAccountsForEntityType(entityType);
  const { error: coaError } = await supabase.from("chart_of_accounts").insert(
    accounts.map((a) => ({ organization_id: orgId, ...a }))
  );

  if (coaError) {
    // Non-fatal — org + membership exist, CoA can be re-seeded
    console.error("CoA seed error:", coaError);
  }

  // Set org cookie for middleware routing
  const cookieStore = await cookies();
  cookieStore.set(ORG_COOKIE, orgId, COOKIE_OPTS);

  /*
   * Into the guided setup, not onto the dashboard.
   *
   * /home for a minutes-old account is a finance dashboard of zeros: no
   * revenue, no invoices, no clients, and nothing on it that tells the owner
   * what to do next. /setup carries on from the form they just filled in and
   * ends at a call their AI receptionist answered. Anyone who wants the
   * dashboard can skip every step and be there in five clicks; where they are
   * up to is read back off their own rows, so the route is resumable rather
   * than a one-shot they can fall out of.
   */
  redirect("/setup");
}
