import { NextResponse } from "next/server";
import { requireMobileAgent } from "@/lib/mobile/auth";
import { supabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";

/**
 * DELETE /api/mobile/account
 *
 * Account deletion entry point invoked from the mobile Settings → Delete
 * Account flow. Required for Apple App Review (Guideline 5.1.1(v)) and
 * Google Play account-deletion policy.
 *
 * Sequence:
 *   1. Mark the agent row deleted (`deleted_at = now()`) and detach it from
 *      the Supabase auth user. The row stays around briefly so the purge
 *      sweeper can audit what was removed.
 *   2. Delete the Supabase auth user. Doing this second means the agent row
 *      is already detached if step 2 fails — a retry from the sweeper is
 *      idempotent because `auth_user_id` is already null.
 *
 * The endpoint is intentionally tolerant of "user already gone" because the
 * client may retry on a flaky connection.
 */
export async function DELETE(req: Request) {
  const auth = await requireMobileAgent(req);
  if (auth.ok === false) return auth.response;

  const { userId, agentId } = auth.ctx;

  const { error: updateError } = await supabaseAdmin
    .from("agents")
    .update({ deleted_at: new Date().toISOString(), auth_user_id: null })
    .eq("id", agentId);

  if (updateError) {
    console.error("DELETE /api/mobile/account: mark agent deleted", updateError);
    return NextResponse.json(
      { ok: false, success: false, error: "Could not mark account for deletion." },
      { status: 500 }
    );
  }

  const { error: authError } = await supabaseAdmin.auth.admin.deleteUser(userId);
  if (authError && !/not found/i.test(authError.message)) {
    console.error("DELETE /api/mobile/account: delete auth user", authError);
    return NextResponse.json(
      { ok: false, success: false, error: "Could not revoke session credentials." },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true, success: true }, { status: 200 });
}

/**
 * GET /api/mobile/account
 *
 * The little the app's header needs to draw the agent: an email, a brand
 * name for initials, and the photo if one was uploaded on the web. The web
 * keeps the account menu top-right; the app now does the same and had no
 * endpoint to ask who is signed in.
 */
export async function GET(req: Request) {
  const auth = await requireMobileAgent(req);
  if (auth.ok === false) return auth.response;

  const { data: agent, error } = await supabaseAdmin
    .from("agents")
    .select("brand_name, agent_photo_url")
    .eq("id", auth.ctx.agentId)
    .maybeSingle();
  if (error) {
    console.error("GET /api/mobile/account", error);
    return NextResponse.json({ ok: false, success: false, error: "Server error" }, { status: 500 });
  }

  const { data: user } = await supabaseAdmin.auth.admin.getUserById(auth.ctx.userId);
  const row = (agent ?? {}) as { brand_name?: string | null; agent_photo_url?: string | null };

  return NextResponse.json({
    ok: true,
    success: true,
    account: {
      email: user?.user?.email ?? null,
      brandName: row.brand_name ?? null,
      photoUrl: row.agent_photo_url ?? null,
    },
  });
}
