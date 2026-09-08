import type { SupabaseClient } from "@supabase/supabase-js";
import { redirect } from "next/navigation";
import { getPropertyToolsConsumerPostLoginUrl } from "@/lib/propertyToolsConsumerUrl";
import { isRealEstateProfessionalRole } from "@/lib/paidSubscriptionEligibility";
import { consumerShouldUsePropertyToolsApp } from "@/lib/signupOriginApp";
import {
  UNAUTHORIZED_PATH,
  matchesPortalKind,
  resolveRoleHomePath,
  START_FREE_AGENT_PATH,
  type PortalKind,
} from "@/lib/rolePortalPaths";

function missingUserIdColumn(err: unknown): boolean {
  const msg = String((err as { message?: string })?.message ?? "");
  return (
    /user_id.*does not exist/i.test(msg) ||
    /column\s+.*user_id.*does not exist/i.test(msg)
  );
}

export type UserPortalContext = {
  userId: string;
  role: string | null;
  hasAgentRow: boolean;
  isPro: boolean;
  /** `user_profiles.signup_origin_app` — null for legacy rows */
  signupOriginApp: string | null;
};

/**
 * Who is signed in and which portal they belong to.
 *
 * Runs in the proxy on every `/dashboard/*` request, from an edge region that
 * is not the database's. It used to make four network calls in series —
 * `getUser()` to Supabase Auth, then user_profiles, leadsmart_users and
 * agents one after another — which was the difference between a dashboard
 * page's first byte (~0.9 s warm) and an API route's (0.2 s) on production,
 * 2026-09-08. Now: the caller's already-verified user id when it has one
 * (the proxy does), otherwise the local claims check, and the three reads
 * together.
 */
export async function fetchUserPortalContext(
  supabase: SupabaseClient,
  knownUserId?: string | null,
): Promise<UserPortalContext | null> {
  let userId = knownUserId ?? null;
  if (!userId) {
    const { data: claimsData } = await supabase.auth.getClaims().catch(() => ({ data: null }));
    const sub = (claimsData?.claims as { sub?: unknown } | undefined)?.sub;
    if (typeof sub === "string" && sub) {
      userId = sub;
    } else {
      const {
        data: { user },
        error,
      } = await supabase.auth.getUser();
      if (error || !user) return null;
      userId = user.id;
    }
  }

  const [{ data: originRow }, userRes, { data: agentRow }] = await Promise.all([
    supabase.from("user_profiles").select("signup_origin_app").eq("user_id", userId).maybeSingle(),
    supabase.from("leadsmart_users").select("role").eq("user_id", userId).maybeSingle(),
    supabase.from("agents").select("id").eq("auth_user_id", userId).maybeSingle(),
  ]);
  const signupOriginApp =
    (originRow as { signup_origin_app?: string | null } | null)?.signup_origin_app?.trim() || null;
  const hasAgentRow = !!agentRow;

  let rowErr: unknown = userRes.error;
  if (rowErr && missingUserIdColumn(rowErr)) rowErr = null;
  if (userRes.error && rowErr) {
    // The account row could not be read: judge by the agent row alone.
    return { userId, role: null, hasAgentRow, isPro: hasAgentRow, signupOriginApp };
  }

  const r = (userRes.data as { role?: string } | null)?.role ?? null;
  const isPro = r === "user" && !hasAgentRow ? false : isRealEstateProfessionalRole(r) || hasAgentRow;

  return { userId, role: r, hasAgentRow, isPro, signupOriginApp };
}

/**
 * `null` = show public marketing home (`LeadSmartLanding`).
 * Signed-in professionals redirect to their dashboard; everyone else stays on marketing home.
 */
export async function resolvePostAuthHomePath(supabase: SupabaseClient): Promise<string | null> {
  const ctx = await fetchUserPortalContext(supabase);
  if (!ctx) return null;
  if (!ctx.isPro) return null;
  return resolveRoleHomePath(ctx.role, ctx.hasAgentRow);
}

export function ensurePortalAccess(kind: PortalKind, ctx: UserPortalContext | null): void {
  if (!ctx) {
    redirect(`/login?redirect=/${kind}`);
  }

  // Admin / support trees: wrong role → explicit unauthorized (not bounced to another dashboard).
  if (kind === "admin") {
    if (!matchesPortalKind(ctx.role, "admin")) {
      redirect(UNAUTHORIZED_PATH);
    }
    if (!ctx.isPro && consumerShouldUsePropertyToolsApp(ctx.signupOriginApp)) {
      redirect(getPropertyToolsConsumerPostLoginUrl());
    }
    if (!ctx.isPro) {
      redirect(START_FREE_AGENT_PATH);
    }
    return;
  }

  if (!ctx.isPro && consumerShouldUsePropertyToolsApp(ctx.signupOriginApp)) {
    redirect(getPropertyToolsConsumerPostLoginUrl());
  }
  if (!ctx.isPro) {
    redirect(START_FREE_AGENT_PATH);
  }
  if (!matchesPortalKind(ctx.role, kind)) {
    redirect(resolveRoleHomePath(ctx.role, ctx.hasAgentRow));
  }
}
