import { NextResponse } from "next/server";
import { z } from "zod";

import { requireMobileAgent } from "@/lib/mobile/auth";
import { supabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";

const bodySchema = z.object({
  id: z.string().uuid().optional(),
  all: z.boolean().optional(),
});

/** POST /api/mobile/leads-gen/connect/youtube/disconnect — remove this agent's YouTube connection(s). */
export async function POST(req: Request) {
  const auth = await requireMobileAgent(req);
  if (auth.ok === false) return auth.response;

  try {
    const json = await req.json().catch(() => ({}));
    const parsed = bodySchema.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json(
        { ok: false, success: false, error: "Invalid body", details: parsed.error.flatten() },
        { status: 400 },
      );
    }
    const { id, all } = parsed.data;
    if (!id && !all) {
      return NextResponse.json({ ok: false, success: false, error: "Pass `id` or `all`." }, { status: 400 });
    }

    let query = supabaseAdmin
      .from("social_accounts")
      .delete({ count: "exact" })
      .eq("agent_id", auth.ctx.agentId)
      .eq("platform", "youtube");
    if (id) query = query.eq("id", id);

    const { error, count } = await query;
    if (error) throw error;
    return NextResponse.json({ ok: true, success: true, removed: count ?? 0 });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Disconnect failed";
    console.error("[mobile/leads-gen/connect/youtube/disconnect]", e);
    return NextResponse.json({ ok: false, success: false, error: msg }, { status: 500 });
  }
}
