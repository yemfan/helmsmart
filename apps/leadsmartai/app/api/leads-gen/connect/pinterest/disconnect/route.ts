import { NextResponse } from "next/server";
import { z } from "zod";

import { getDashboardAgentContext } from "@/lib/contact-intake/dashboardAgentContext";
import { supabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";

const bodySchema = z.object({
  id: z.string().uuid().optional(),
  all: z.boolean().optional(),
});

/**
 * POST /api/leads-gen/connect/pinterest/disconnect
 *
 *   { id: "<uuid>" } — disconnect a single Pinterest connection
 *   { all: true }   — disconnect every Pinterest connection this agent has
 *
 * Hard-deletes the social_accounts row(s) (the encrypted tokens are sensitive).
 * Mirrors the Threads/LinkedIn disconnect routes. Doesn't revoke the grant on
 * Pinterest's side — the agent removes the app in Pinterest settings.
 */
export async function POST(req: Request) {
  try {
    const auth = await getDashboardAgentContext();
    if (auth.ok === false) return auth.response;

    const json = await req.json().catch(() => ({}));
    const parsed = bodySchema.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json(
        { ok: false, error: "Invalid body", details: parsed.error.flatten() },
        { status: 400 },
      );
    }
    const { id, all } = parsed.data;
    if (!id && !all) {
      return NextResponse.json({ ok: false, error: "Pass `id` or `all`." }, { status: 400 });
    }

    let query = supabaseAdmin
      .from("social_accounts")
      .delete({ count: "exact" })
      .eq("agent_id", auth.agentId)
      .eq("platform", "pinterest");
    if (id) query = query.eq("id", id);

    const { error, count } = await query;
    if (error) throw error;

    return NextResponse.json({ ok: true, removed: count ?? 0 });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Disconnect failed";
    console.error("[leads-gen/connect/pinterest/disconnect]", e);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
