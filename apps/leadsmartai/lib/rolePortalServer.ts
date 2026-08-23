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

export async function fetchUserPortalContext(
  supabase: SupabaseClient
): Promise<UserPortalContext | null> {
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();
  if (error || !user) return null;

  const userId = user.id;
  let role: string | null = null;
  let hasAgentRow = false;
  let isPro = false;
  let signupOriginApp: string | null = null;

  const { data: originRow } = await supabase
    .from("user_profiles")
    .select("signup_origin_app")
    .eq("user_id", userId)
    .maybeSingle();
  signupOriginApp =
    (originRow as { signup_origin_app?: string | null } | null)?.signup_origin_app?.trim() || null;

  try {
    let userRow: { role?: string } | null = null;
    let rowErr: unknown = null;
    ({ data: userRow, error: rowErr } = await supabase
      .from("leadsmart_users")
      .select("role")
      .eq("user_id", userId)
      .maybeSingle());

    if (rowErr && missingUserIdColumn(rowErr)) {
      rowErr = null;
    }

    const r = userRow?.role ?? null;
    role = r ?? null;

    const { data: agentRow } = await supabase
      .from("agents")
      .select("id")
      .eq("auth_user_id", userId)
      .maybeSingle();
    hasAgentRow = !!agentRow;

    if (!rowErr && r === "user" && !hasAgentRow) {
      isPro = false;
    } else {
      isPro = isRealEstateProfessionalRole(r) || hasAgentRow;
    }
  } catch {
    const { data: agentRow } = await supabase
      .from("agents")
      .select("id")
      .eq("auth_user_id", userId)
      .maybeSingle();
    hasAgentRow = !!agentRow;
    isPro = hasAgentRow;
    role = null;
  }

  return { userId, role, hasAgentRow, isPro, signupOriginApp };
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
