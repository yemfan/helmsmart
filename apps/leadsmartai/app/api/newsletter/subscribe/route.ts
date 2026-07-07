import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";
import { sendEmail } from "@/lib/email";
import { getSiteUrl } from "@/lib/siteUrl";
import { newsletterFrom } from "@/lib/newsletter/sendConfig";

export const runtime = "nodejs";

/**
 * Weekly Regional Newsletter — subscribe capture + double opt-in (Phase 2).
 *
 * Captures the subscriber to newsletter_subscriptions via the service-role
 * client (RLS-deny). agent_id is null (public RealtyBoss subscription).
 *
 * DOUBLE OPT-IN: after insert (or on an existing UNCONFIRMED row) we email a
 * confirmation link (/newsletter/confirm?token=confirm_token). No issue is sent
 * until the subscriber clicks it. If the row is already confirmed we just say
 * "you're subscribed". Email send is best-effort — a Resend failure still
 * returns ok (logged), so the capture never fails on a transient mail error.
 */

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const VALID_LEVELS = new Set(["national", "state", "metro"]);

type SubRow = {
  id: string;
  confirm_token: string | null;
  confirmed_at: string | null;
  status: string;
};

export async function POST(req: Request) {
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()) {
    return NextResponse.json(
      { ok: false, error: "Subscriptions are temporarily unavailable." },
      { status: 503 },
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid request." }, { status: 400 });
  }

  const o = (body ?? {}) as Record<string, unknown>;
  const email = String(o.email ?? "").trim().toLowerCase();
  const regionLevel = String(o.regionLevel ?? "").trim().toLowerCase();
  const regionCode = String(o.regionCode ?? "").trim();
  const regionName =
    typeof o.regionName === "string" && o.regionName.trim() ? o.regionName.trim() : null;

  if (!EMAIL_RE.test(email) || email.length > 320) {
    return NextResponse.json(
      { ok: false, error: "Please enter a valid email address." },
      { status: 400 },
    );
  }
  if (!VALID_LEVELS.has(regionLevel) || !regionCode) {
    return NextResponse.json(
      { ok: false, error: "Please choose a region." },
      { status: 400 },
    );
  }

  try {
    // agent_id null = public RealtyBoss subscription. The dedupe index is on an
    // EXPRESSION (lower(email), region_code, coalesce(agent_id::text,'')), which
    // PostgREST's upsert onConflict can't target by a column list — so we plain
    // insert and treat a unique-violation (23505) as "already exists": we then
    // read the existing row back to drive double opt-in.
    let row: SubRow | null = null;

    const { data: inserted, error: insertErr } = await supabaseServer
      .from("newsletter_subscriptions")
      .insert({
        email,
        region_level: regionLevel,
        region_code: regionCode,
        region_name: regionName,
        agent_id: null,
        status: "subscribed",
        source: "web",
      })
      .select("id, confirm_token, confirmed_at, status")
      .maybeSingle();

    if (insertErr && (insertErr as { code?: string }).code !== "23505") {
      console.error("newsletter subscribe insert error", insertErr);
      return NextResponse.json(
        { ok: false, error: "Something went wrong. Please try again." },
        { status: 500 },
      );
    }

    if (inserted) {
      row = inserted as SubRow;
    } else {
      // Existing row (unique violation): fetch it to read confirm state. Match
      // the dedupe key exactly (lower(email) + region_code + public bucket).
      const { data: existing } = await supabaseServer
        .from("newsletter_subscriptions")
        .select("id, confirm_token, confirmed_at, status")
        .eq("email", email)
        .eq("region_code", regionCode)
        .is("agent_id", null)
        .maybeSingle();
      row = (existing as SubRow | null) ?? null;
    }

    // Already confirmed → nothing to do but reassure. (Re-subscribing after an
    // unsubscribe flips status back to 'subscribed' for the confirmed address.)
    if (row?.confirmed_at) {
      if (row.status !== "subscribed") {
        await supabaseServer
          .from("newsletter_subscriptions")
          .update({ status: "subscribed" })
          .eq("id", row.id);
      }
      return NextResponse.json({
        ok: true,
        message: "You're subscribed — you'll get the next weekly issue.",
      });
    }

    // Not yet confirmed → send the confirmation email (best-effort).
    if (row?.confirm_token) {
      const siteUrl = getSiteUrl().replace(/\/$/, "");
      const confirmUrl = `${siteUrl}/newsletter/confirm?token=${encodeURIComponent(
        row.confirm_token,
      )}`;
      try {
        await sendEmail({
          to: email,
          from: newsletterFrom(),
          subject: "Confirm your RealtyBoss weekly housing briefing",
          text: [
            "Thanks for subscribing to the RealtyBoss weekly housing briefing.",
            "",
            "Please confirm your subscription by opening this link:",
            confirmUrl,
            "",
            "If you didn't request this, you can ignore this email — no issues will be sent.",
          ].join("\n"),
          html: confirmEmailHtml(confirmUrl),
        });
      } catch (mailErr) {
        // Best-effort: log but still return ok. The subscriber can re-submit to
        // retrigger the confirmation email.
        console.error("newsletter confirmation email failed", mailErr);
      }
    }

    return NextResponse.json({
      ok: true,
      message: "Check your email to confirm your subscription.",
    });
  } catch (e) {
    console.error("newsletter subscribe error", e);
    return NextResponse.json(
      { ok: false, error: "Something went wrong. Please try again." },
      { status: 500 },
    );
  }
}

function confirmEmailHtml(confirmUrl: string): string {
  const safe = confirmUrl
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
  return `<div style="background:#f8fafc;padding:24px 0;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#0f172a;">
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center" style="width:100%;max-width:560px;margin:0 auto;">
    <tr><td style="padding:0 20px;">
      <div style="font-size:13px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:#0072ce;">RealtyBoss</div>
      <h1 style="font-size:20px;font-weight:800;color:#0f172a;margin:14px 0 8px;">Confirm your subscription</h1>
      <p style="font-size:15px;line-height:1.55;color:#475569;margin:0 0 16px;">Thanks for subscribing to the RealtyBoss weekly housing briefing — plain-English mortgage rates and housing news, paired with your region's market snapshot. Confirm below to start receiving it.</p>
      <p style="margin:0 0 20px;">
        <a href="${safe}" style="display:inline-block;background:#0072ce;color:#ffffff;font-size:15px;font-weight:700;text-decoration:none;padding:11px 20px;border-radius:8px;">Confirm subscription →</a>
      </p>
      <p style="font-size:12px;line-height:1.55;color:#94a3b8;margin:0;">If the button doesn't work, paste this link into your browser:<br/><span style="color:#64748b;">${safe}</span></p>
      <p style="font-size:12px;line-height:1.55;color:#94a3b8;margin:16px 0 0;">If you didn't request this, ignore this email — no issues will be sent.</p>
    </td></tr>
  </table>
</div>`;
}
