import { NextResponse } from "next/server";
import { resolveAccessTier } from "@/lib/access";
import { getUserFromRequest } from "@/lib/authFromRequest";
import { supabaseServer } from "@/lib/supabaseServer";

export async function POST(req: Request) {
  try {
    const user = await getUserFromRequest(req);
    if (!user) {
      return NextResponse.json({
        ok: true,
        plan: "free",
        subscription_status: "guest",
        access: "limited",
      });
    }

    const { data: row, error } = await supabaseServer
      .from("user_profiles")
      .select(
        "leadsmart_users(plan,subscription_status,trial_ends_at,trial_used,role),propertytools_users(tier,subscription_status)"
      )
      .eq("user_id", user.id)
      .maybeSingle();
    if (error && (error as { code?: string }).code !== "PGRST116") throw error;

    const up = row as {
      leadsmart_users?: Record<string, unknown> | Record<string, unknown>[] | null;
      propertytools_users?: { tier?: string; subscription_status?: string | null } | { tier?: string; subscription_status?: string | null }[] | null;
    } | null;

    const lsRaw = up?.leadsmart_users;
    const ls = lsRaw == null ? null : Array.isArray(lsRaw) ? lsRaw[0] : lsRaw;
    const ptRaw = up?.propertytools_users;
    const pt = ptRaw == null ? null : Array.isArray(ptRaw) ? ptRaw[0] : ptRaw;

    let plan = String(ls?.plan ?? "free");
    let status = String(ls?.subscription_status ?? "inactive").toLowerCase();
    const trialEndsAt = ls?.trial_ends_at
      ? new Date(String(ls.trial_ends_at))
      : null;

    const ptTier = pt?.tier === "premium" || pt?.tier === "basic" ? pt.tier : null;
    const mergedSubStatus =
      pt?.subscription_status != null && String(pt.subscription_status).trim() !== ""
        ? String(pt.subscription_status).toLowerCase()
        : status;

    // Auto-end expired trial (CloseBoss trial lives on leadsmart_users).
    if (status === "trialing" && trialEndsAt && trialEndsAt.getTime() <= Date.now()) {
      status = "inactive";
      plan = "free";
      await supabaseServer
        .from("leadsmart_users")
        .update({
          plan: "free",
          subscription_status: "inactive",
        })
        .eq("user_id", user.id);
    }

    const rawRole = String(ls?.role ?? "").toLowerCase().trim();
    const accountRole =
      rawRole === "user" || rawRole === "" ? "consumer" : String(ls?.role ?? "");

    const accessTier = resolveAccessTier({
      userId: user.id,
      plan,
      subscriptionStatus: mergedSubStatus,
      accountRole,
      propertytoolsTier: ptTier,
    });
    const fullAccess = accessTier === "premium";

    return NextResponse.json({
      ok: true,
      plan,
      subscription_status: status,
      trial_ends_at: trialEndsAt ? trialEndsAt.toISOString() : null,
      trial_used: Boolean(ls?.trial_used ?? false),
      access: fullAccess ? "full" : "limited",
      account_role: accountRole,
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Server error";
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
