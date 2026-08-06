"use server";

import { randomUUID } from "node:crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
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

  if (!name) return { error: "Business name is required." };
  if (!entityType) return { error: "Please select a business structure." };

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
    return { error: "Failed to create organization. Please try again." };
  }

  // Add the user as owner
  const { error: memberError } = await supabase.from("organization_members").insert({
    organization_id: orgId,
    user_id: user.id,
    role: "owner",
  });

  if (memberError) {
    console.error("createOrg membership error:", memberError);
    return { error: "Organization created but membership failed. Contact support." };
  }

  // Persist the onboarding details that depend on migration 00085 — the
  // 'nonprofit' entity type and the `website` column. Done AFTER membership (so
  // the owner UPDATE policy applies) and best-effort + isolated: a not-yet-run
  // migration only means these persist later, never that a signup fails.
  if (entityType !== insertEntityType) {
    const { error } = await supabase
      .from("organizations")
      .update({ entity_type: entityType })
      .eq("id", orgId);
    if (error) {
      console.error(
        "createOrg: could not set entity_type (is migration 00085 applied?):",
        error.message,
      );
    }
  }
  if (website) {
    const { error } = await supabase
      .from("organizations")
      .update({ website })
      .eq("id", orgId);
    if (error) {
      console.error(
        "createOrg: could not save website (is migration 00085 applied?):",
        error.message,
      );
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

  redirect("/home");
}
