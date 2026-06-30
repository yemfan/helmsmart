import { NextResponse } from "next/server";
import { EMAIL_BRAND } from "@/lib/email";
import { supabaseServer } from "@/lib/supabaseServer";

export const runtime = "nodejs";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Exit-intent / marketing capture: email only.
 * Notifies via Resend when configured; always logs a growth event when Supabase works.
 */
export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => ({}))) as {
      email?: string;
      website?: string;
      page_path?: string;
    };

    if (body.website) {
      return NextResponse.json({ ok: true });
    }

    const email = String(body.email ?? "").trim().toLowerCase();
    if (!email || !EMAIL_RE.test(email)) {
      return NextResponse.json({ ok: false, error: "Valid email is required." }, { status: 400 });
    }

    const pagePath = String(body.page_path ?? "/").trim() || "/";

    const resendApiKey = process.env.RESEND_API_KEY;
    const notifyTo = process.env.AGENT_NOTIFICATION_EMAIL || "fan.yes@gmail.com";

    if (resendApiKey) {
      try {
        await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${resendApiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            from: `${EMAIL_BRAND} <noreply@realtybossai.com>`,
            to: [notifyTo],
            subject: "Exit popup: 3 free buyer leads request",
            text: `Someone requested the exit-popup offer (3 free buyer leads).

Email: ${email}
Page: ${pagePath}
Time: ${new Date().toISOString()}`,
          }),
        });
      } catch (e) {
        console.error("exit-intent Resend error", e);
      }
    } else {
      console.log("[exit-intent] RESEND_API_KEY not set; email:", email);
    }

    const { error: trafficErr } = await supabaseServer.from("traffic_events").insert({
      event_type: "conversion",
      page_path: pagePath,
      city: null,
      source: "marketing",
      campaign: "exit_intent_buyer_leads",
      contact_id: null,
      metadata: { email_hint: `${email.slice(0, 3)}***`, offer: "exit_popup_buyer_leads" },
    } as Record<string, unknown>);
    if (trafficErr) {
      console.warn("exit-intent traffic_events:", trafficErr.message);
    }

    return NextResponse.json({ ok: true });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Server error";
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
