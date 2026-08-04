import { NextResponse } from "next/server";
import crypto from "node:crypto";
import { z } from "zod";

import { generateAuthorizeUrl, signState, youtubeConfigured } from "@/lib/leads-gen/youtube-oauth";
import { requireMobileAgent } from "@/lib/mobile/auth";
import { supabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";

const bodySchema = z.object({
  returnTo: z.string().regex(/^leadsmart:\/\//i),
});

/**
 * POST /api/mobile/leads-gen/connect/youtube/init
 *
 * Mobile counterpart to GET /api/leads-gen/connect/youtube/start. Bearer-auth in,
 * a signed Google OAuth URL with the mobile `returnTo` deep link baked into the
 * state token out (the web /callback honors it). Pro+ gate, same as Meta/LinkedIn.
 */
export async function POST(req: Request) {
  const auth = await requireMobileAgent(req);
  if (auth.ok === false) return auth.response;

  try {
    if (!youtubeConfigured()) {
      return NextResponse.json(
        { ok: false, success: false, error: "YouTube isn't configured on the server." },
        { status: 503 },
      );
    }

    const { data: agentRow } = await supabaseAdmin
      .from("agents")
      .select("plan_type")
      .eq("id", auth.ctx.agentId)
      .maybeSingle();
    const planType = ((agentRow as { plan_type: string | null } | null)?.plan_type ?? "free").toLowerCase();
    if (planType === "free") {
      return NextResponse.json(
        { ok: false, success: false, error: "Connecting YouTube requires Pro or higher." },
        { status: 402 },
      );
    }

    const json = await req.json().catch(() => ({}));
    const parsed = bodySchema.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json(
        { ok: false, success: false, error: "Invalid body", details: parsed.error.flatten() },
        { status: 400 },
      );
    }

    const state = signState({
      nonce: crypto.randomBytes(16).toString("hex"),
      agentId: auth.ctx.agentId,
      issuedAt: Date.now(),
      returnTo: parsed.data.returnTo,
    });

    return NextResponse.json({ ok: true, success: true, url: generateAuthorizeUrl(state) });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed to start OAuth";
    console.error("[mobile/leads-gen/connect/youtube/init]", e);
    return NextResponse.json({ ok: false, success: false, error: msg }, { status: 500 });
  }
}
