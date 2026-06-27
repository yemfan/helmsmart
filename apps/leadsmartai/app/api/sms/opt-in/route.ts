import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { SMS_CONSENT_TEXT } from "@/app/sms/consent";

export const runtime = "nodejs";

/**
 * POST /api/sms/opt-in — records a public SMS opt-in from the /sms page.
 *
 * Requires an explicit consent=true (the checkbox is unchecked by default) and
 * a valid US phone. Stores the exact consent language the user agreed to +
 * IP/UA for TCPA proof-of-consent. This is the carrier-reviewable opt-in flow
 * for the A2P 10DLC campaign.
 */
export async function POST(req: Request) {
  let body: Record<string, unknown> = {};
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid request." }, { status: 400 });
  }

  const phoneDigits = String(body.phone ?? "").replace(/\D/g, "");
  if (phoneDigits.length !== 10) {
    return NextResponse.json({ ok: false, error: "Enter a valid 10-digit US phone number." }, { status: 400 });
  }
  if (body.consent !== true) {
    return NextResponse.json(
      { ok: false, error: "You must check the consent box to receive text messages." },
      { status: 400 },
    );
  }

  const name = typeof body.name === "string" ? body.name.trim().slice(0, 200) || null : null;
  const email = typeof body.email === "string" ? body.email.trim().slice(0, 200) || null : null;
  const ip = (req.headers.get("x-forwarded-for") || "").split(",")[0]?.trim() || null;
  const userAgent = req.headers.get("user-agent")?.slice(0, 400) || null;

  const { error } = await supabaseAdmin.from("sms_opt_ins").insert({
    name,
    phone: `+1${phoneDigits}`,
    email,
    consent_text: SMS_CONSENT_TEXT,
    source: "sms_optin_page",
    ip,
    user_agent: userAgent,
  } as any);

  if (error) {
    console.error("[sms/opt-in] insert failed:", error.message);
    return NextResponse.json({ ok: false, error: "Could not record your opt-in. Please try again." }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
