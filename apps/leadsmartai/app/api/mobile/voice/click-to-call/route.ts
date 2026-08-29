import { NextResponse } from "next/server";
import { requireMobileAgent } from "@/lib/mobile/auth";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { ClickToCallError } from "@/lib/voice/clickToCall";
import { startClickToCall } from "@/lib/voice/clickToCall.server";

export const runtime = "nodejs";

/**
 * POST /api/mobile/voice/click-to-call
 *
 * Mobile mirror of /api/voice/click-to-call. Same body `{ contactId }`,
 * same Twilio bridge, same structured error envelope. Auth differs:
 * Bearer-only via requireMobileAgent (no cookie session).
 *
 * On mobile the agent's phone IS the device they're holding, so the
 * Twilio bridge dials them, they answer, and Twilio joins the contact's
 * leg — same as web. The reason to prefer this over a plain tel: link
 * is call logging: every bridge writes to lead_calls so the timeline
 * stays accurate.
 */
export async function POST(req: Request) {
  const auth = await requireMobileAgent(req);
  if (auth.ok === false) return auth.response;

  let payload: { contactId?: string };
  try {
    payload = (await req.json()) as { contactId?: string };
  } catch {
    return NextResponse.json(
      { ok: false, success: false, error: "Invalid JSON" },
      { status: 400 },
    );
  }
  const contactId = payload.contactId?.trim();
  if (!contactId) {
    return NextResponse.json(
      { ok: false, success: false, error: "contactId required" },
      { status: 400 },
    );
  }

  // Agent phone — try agents.phone, then agent_profiles.phone.
  const { data: agentRow } = await supabaseAdmin
    .from("agents")
    .select("phone, auth_user_id")
    .eq("id", auth.ctx.agentId)
    .maybeSingle();
  let agentPhone =
    (agentRow as { phone?: string | null } | null)?.phone ?? null;
  if (!agentPhone) {
    const userId = (agentRow as { auth_user_id?: string | null } | null)
      ?.auth_user_id;
    if (userId) {
      const { data: profile } = await supabaseAdmin
        .from("agent_profiles")
        .select("phone")
        .eq("user_id", userId)
        .maybeSingle();
      agentPhone =
        (profile as { phone?: string | null } | null)?.phone ?? null;
    }
  }

  // Contact phone — must belong to this agent (authorization).
  const { data: contactRow } = await supabaseAdmin
    .from("contacts")
    .select("phone, name, first_name, last_name")
    .eq("id", contactId)
    .eq("agent_id", auth.ctx.agentId)
    .maybeSingle();
  if (!contactRow) {
    return NextResponse.json(
      {
        ok: false,
        success: false,
        error: "Contact not found",
        code: "not_found",
      },
      { status: 404 },
    );
  }
  const c = contactRow as {
    phone?: string | null;
    name?: string | null;
    first_name?: string | null;
    last_name?: string | null;
  };
  const contactPhone = c.phone ?? null;
  const whisper = buildWhisper(c);

  const appBaseUrl =
    process.env.NEXT_PUBLIC_APP_URL?.trim() ||
    process.env.APP_BASE_URL?.trim() ||
    new URL(req.url).origin;

  try {
    const out = await startClickToCall({
      agentId: auth.ctx.agentId,
      contactId,
      agentPhoneRaw: agentPhone,
      contactPhoneRaw: contactPhone,
      whisper,
      appBaseUrl,
    });
    return NextResponse.json({ ok: true, success: true, ...out });
  } catch (e) {
    if (e instanceof ClickToCallError) {
      const status =
        e.code === "missing_caller_id" || e.code === "twilio_not_configured"
          ? 503
          : 400;
      return NextResponse.json(
        { ok: false, success: false, error: e.message, code: e.code },
        { status },
      );
    }
    return NextResponse.json(
      {
        ok: false,
        success: false,
        error: (e as Error).message,
        code: "unknown",
      },
      { status: 500 },
    );
  }
}

function buildWhisper(c: {
  name?: string | null;
  first_name?: string | null;
  last_name?: string | null;
}): string | null {
  const full =
    c.name?.trim() ||
    [c.first_name?.trim(), c.last_name?.trim()]
      .filter(Boolean)
      .join(" ")
      .trim();
  if (!full) return null;
  return `Calling ${full} now.`;
}
