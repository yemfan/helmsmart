import { NextResponse } from "next/server";
import { getUserFromRequest } from "@/lib/authFromRequest";
import { supabaseServer } from "@/lib/supabaseServer";
import { getActiveAgentEntitlement } from "@/lib/entitlements/getEntitlements";

export async function GET(req: Request) {
  try {
    const user = await getUserFromRequest(req);
    if (!user) {
      return NextResponse.json({ plan: "guest", tokens_remaining: null });
    }

    const { data, error } = await supabaseServer
      .from("user_profiles")
      .select(
        "full_name,phone,avatar_url,email,signup_origin_app,leadsmart_users(plan,tokens_remaining,tokens_reset_date,role,subscription_status,trial_ends_at,trial_used,oauth_onboarding_completed)"
      )
      .eq("user_id", user.id)
      .maybeSingle();

    if (error && (error as any).code !== "PGRST116") throw error;

    const rawLs = (data as { leadsmart_users?: Record<string, unknown> | Record<string, unknown>[] | null } | null)
      ?.leadsmart_users;
    const ls = rawLs == null ? null : Array.isArray(rawLs) ? rawLs[0] : rawLs;

    const { data: agentRow } = await supabaseServer
      .from("agents")
      .select("id")
      .eq("auth_user_id", user.id)
      .maybeSingle();

    // Source of truth for the plan is the entitlement system (same as Billing /
    // /api/entitlements/me), not the legacy leadsmart_users.plan column — which
    // drifts (a Pro account was reporting `free` here). Fall back to the legacy
    // column only when there is no active entitlement so legacy-only paid
    // accounts are never downgraded.
    const entitlement = await getActiveAgentEntitlement(supabaseServer, user.id).catch(() => null);
    const plan = entitlement?.plan ?? (ls?.plan as string | undefined) ?? "free";

    const profileEmail = (data as { email?: string | null } | null)?.email?.trim() || null;

    return NextResponse.json({
      email: profileEmail || user.email || null,
      plan,
      role: (ls?.role as string | undefined) ?? "user",
      has_agent_record: !!agentRow,
      subscription_status: (ls?.subscription_status as string | null | undefined) ?? null,
      trial_ends_at: (ls?.trial_ends_at as string | null | undefined) ?? null,
      trial_used: Boolean(ls?.trial_used ?? false),
      tokens_remaining: (ls?.tokens_remaining as number | undefined) ?? 10,
      tokens_reset_date: (ls?.tokens_reset_date as string | null | undefined) ?? null,
      full_name: (data as { full_name?: string | null } | null)?.full_name ?? null,
      phone: (data as { phone?: string | null } | null)?.phone ?? null,
      avatar_url: (data as { avatar_url?: string | null } | null)?.avatar_url ?? null,
      oauth_onboarding_completed: (ls?.oauth_onboarding_completed as boolean | null | undefined) ?? null,
      signup_origin_app: (data as { signup_origin_app?: string | null } | null)?.signup_origin_app ?? null,
    });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message ?? "Server error" },
      { status: 500 }
    );
  }
}

