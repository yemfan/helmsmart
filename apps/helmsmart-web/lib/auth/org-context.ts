/**
 * Who may act on the active organization — the one membership check.
 *
 * The active org is a cookie, and a cookie is whatever the browser sends. On
 * its own it proves nothing: anyone can set `helmsmart-org-id` to any UUID.
 * `proxy.ts` only redirects page routes when the user or the cookie is
 * missing; it never asks whether the user belongs to that org, and server
 * actions can be POSTed to any route, so it does not stand in front of them at
 * all. Every action and route handler that scopes work to the cookie org —
 * above all the ones that then use the service-role client, which bypasses RLS
 * — must go through `requireOrgMember()` first. `lib/auth/org-guard.test.ts`
 * fails the build when one does not.
 *
 * The check runs on the RLS client: `auth.getUser()` validates the session
 * with Supabase, and the member's own `organization_members` row is readable
 * under "members can view their org roster".
 */
import { cache } from "react";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { getServerT } from "@/lib/i18n/server";
import type { OrgRole } from "@/lib/rbac";

/** The active-org cookie, and the name it had before the HelmSmart rename. */
export const ORG_COOKIE = "helmsmart-org-id";
export const LEGACY_ORG_COOKIE = "smbai-org-id";

export type OrgRefusalReason = "no-org" | "not-signed-in" | "not-member" | "lookup-failed";

export type OrgMember = { ok: true; orgId: string; userId: string; role: OrgRole };
export type OrgRefusal = { ok: false; reason: OrgRefusalReason; error: string };
export type OrgAccess = OrgMember | OrgRefusal;

type Membership =
  | { userId: string; role: OrgRole }
  | { reason: Exclude<OrgRefusalReason, "no-org"> };

/**
 * The org id the browser claims, with no check at all. Accepts both cookie
 * names, in the same order as `proxy.ts`. Only this module may read it —
 * everything else asks `requireOrgMember()`.
 */
async function readOrgCookie(): Promise<string | null> {
  const store = await cookies();
  return store.get(ORG_COOKIE)?.value || store.get(LEGACY_ORG_COOKIE)?.value || null;
}

/*
 * Memoized per request by React `cache()`, keyed by org id — a page or action
 * that asks several times costs one lookup, and an action that switches org
 * mid-request is asked about the new one. Outside a request (tests, scripts)
 * `cache` does not memoize, so nothing leaks between callers.
 */
const lookupMembership = cache(async (orgId: string): Promise<Membership> => {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { reason: "not-signed-in" };

    const { data, error } = await supabase
      .from("organization_members")
      .select("role")
      .eq("organization_id", orgId)
      .eq("user_id", user.id)
      .maybeSingle();

    if (error) {
      console.error("[org-context] membership lookup failed:", error.message);
      return { reason: "lookup-failed" };
    }
    if (!data?.role) return { reason: "not-member" };
    return { userId: user.id, role: data.role as OrgRole };
  } catch (e) {
    // Fail closed: an access check that cannot run has not granted access.
    console.error("[org-context] membership lookup threw:", e);
    return { reason: "lookup-failed" };
  }
});

async function refuse(reason: OrgRefusalReason): Promise<OrgRefusal> {
  const t = await getServerT("common");
  // Literal keys, one per reason, so the i18n key guards can see each of them.
  const error =
    reason === "not-signed-in"
      ? t("orgAccess.notSignedIn")
      : reason === "no-org"
        ? t("orgAccess.noOrg")
        : reason === "lookup-failed"
          ? t("orgAccess.lookupFailed")
          : t("orgAccess.notMember");
  return { ok: false, reason, error };
}

/**
 * The signed-in user's membership in the active org, or why there is none.
 *
 *   const access = await requireOrgMember();
 *   if (!access.ok) return { ok: false, error: access.error };
 *   const { orgId, userId, role } = access;
 *
 * `error` is already in the reader's language and says what to do about it.
 */
export async function requireOrgMember(): Promise<OrgAccess> {
  const orgId = await readOrgCookie();
  if (!orgId) return refuse("no-org");

  const membership = await lookupMembership(orgId);
  if ("reason" in membership) return refuse(membership.reason);
  return { ok: true, orgId, userId: membership.userId, role: membership.role };
}

/**
 * For an action that is HANDED an org id rather than reading the active one.
 * Anything exported from a `"use server"` module is callable on its own with
 * any arguments, so a parameter is a claim just like the cookie is: the caller
 * must be a member of that org, and it must be the org they are working in.
 */
export async function requireMemberOf(orgId: string): Promise<OrgAccess> {
  const access = await requireOrgMember();
  if (access.ok && access.orgId !== orgId) return refuse("not-member");
  return access;
}

/**
 * The active org id — only if the signed-in user is a member of it — else
 * null. A drop-in for the `cookies().get("helmsmart-org-id")?.value` reads it
 * replaces, so each caller keeps its own existing "no org" branch.
 */
export async function getMemberOrgId(): Promise<string | null> {
  const access = await requireOrgMember();
  return access.ok ? access.orgId : null;
}
