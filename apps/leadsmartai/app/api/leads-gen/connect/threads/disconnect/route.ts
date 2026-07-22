import { NextResponse } from "next/server";
import { z } from "zod";

import { getDashboardAgentContext } from "@/lib/contact-intake/dashboardAgentContext";
import { supabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";

const bodySchema = z.object({
  /** Either disconnect a specific connection by id, or all of this agent's Threads connections. */
  id: z.string().uuid().optional(),
  all: z.boolean().optional(),
});

/**
 * POST /api/leads-gen/connect/threads/disconnect
 *
 * Two modes:
 *   { id: "<uuid>" } — disconnect a single Threads connection
 *   { all: true }   — disconnect every Threads connection this agent has
 *
 * Deletes the social_accounts row(s). Mirrors the LinkedIn disconnect route —
 * we hard-delete because the encrypted tokens are sensitive.
 *
 * Doesn't revoke the OAuth grant on Threads' side; that requires the agent to
 * remove the app from their Threads settings → "Website permissions".
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
      return NextResponse.json(
        { ok: false, error: "Pass `id` or `all`." },
        { status: 400 },
      );
    }

    let query = supabaseAdmin
      .from("social_accounts")
      .delete({ count: "exact" })
      .eq("agent_id", auth.agentId)
      .eq("platform", "threads");
    if (id) query = query.eq("id", id);

    const { error, count } = await query;
    if (error) throw error;

    return NextResponse.json({ ok: true, removed: count ?? 0 });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Disconnect failed";
    console.error("[leads-gen/connect/threads/disconnect]", e);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
