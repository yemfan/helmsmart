import { NextResponse } from "next/server";
import { getCurrentAgentContext } from "@/lib/dashboardService";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { ClickToCallError } from "@/lib/voice/clickToCall";
import { startClickToCall } from "@/lib/voice/clickToCall.server";

/**
 * POST /api/voice/click-to-call
 * Body: { contactId: string }
 *
 * Resolves the calling agent's phone (from agents.phone or
 * agent_profiles.phone — whichever is populated), looks up the
 * contact's phone, and kicks off a phone-to-phone bridge via
 * Twilio. Returns the lead_calls row id so the UI can poll for
 * status.
 *
 * Errors carry a structured `code` (from ClickToCallError) so the UI
 * can show the right copy ("Add your phone in Settings", "This
 * contact has no phone on file", etc.) instead of a generic 500.
 */
export async function POST(req: Request) {
  let payload: { contactId?: string };
  try {
    payload = (await req.json()) as { contactId?: string };
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }
  const contactId = payload.contactId?.trim();
  if (!contactId) {
    return NextResponse.json({ ok: false, error: "contactId required" }, { status: 400 });
  }

  const ctx = await getCurrentAgentContext();

  // Agent phone — try agents.phone, then agent_profiles.phone.
  const { data: agentRow } = await supabaseAdmin
    .from("agents")
    .select("phone, auth_user_id")
    .eq("id", ctx.agentId)
    .maybeSingle();
  let agentPhone = (agentRow as { phone?: string | null } | null)?.phone ?? null;
  if (!agentPhone) {
    const userId = (agentRow as { auth_user_id?: string | null } | null)?.auth_user_id;
    if (userId) {
      const { data: profile } = await supabaseAdmin
        .from("agent_profiles")
        .select("phone")
        .eq("user_id", userId)
        .maybeSingle();
      agentPhone = (profile as { phone?: string | null } | null)?.phone ?? null;
    }
  }

  // Contact phone — must belong to this agent (authorization).
  const { data: contactRow } = await supabaseAdmin
    .from("contacts")
    .select("phone, name, first_name, last_name")
    .eq("id", contactId)
    .eq("agent_id", ctx.agentId)
    .maybeSingle();
  if (!contactRow) {
    return NextResponse.json(
      { ok: false, error: "Contact not found", code: "not_found" },
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
      agentId: ctx.agentId,
      contactId,
      agentPhoneRaw: agentPhone,
      contactPhoneRaw: contactPhone,
      whisper,
      appBaseUrl,
    });
    return NextResponse.json({ ok: true, ...out });
  } catch (e) {
    if (e instanceof ClickToCallError) {
      const status = e.code === "missing_caller_id" || e.code === "twilio_not_configured" ? 503 : 400;
      return NextResponse.json(
        { ok: false, error: e.message, code: e.code },
        { status },
      );
    }
    return NextResponse.json(
      { ok: false, error: (e as Error).message, code: "unknown" },
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
    [c.first_name?.trim(), c.last_name?.trim()].filter(Boolean).join(" ").trim();
  if (!full) return null;
  return `Calling ${full} now.`;
}
