import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";
import { sendEmail } from "@/lib/email";
import { getSiteUrl } from "@/lib/siteUrl";
import { newsletterFrom, agentNewsletterFrom } from "@/lib/newsletter/sendConfig";
import { resolveAgentIdByNewsletterToken } from "@/lib/newsletter/agentToken";
import { loadPresentationAgent } from "@/lib/presentations/loadPresentationAgent";

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
  const agentToken =
    typeof o.agentToken === "string" && o.agentToken.trim() ? o.agentToken.trim() : null;

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

  // Phase 3: an agentToken (from /newsletter/a/[token]) attributes the sub to
  // that agent so the weekly issue goes out under THEIR brand. An unknown token
  // falls back to a public sub (agent_id null) rather than failing the capture.
  const agentId = agentToken
    ? await resolveAgentIdByNewsletterToken(agentToken)
    : null;

  try {
    // agent_id null = public RealtyBoss subscription; a bigint = an agent-branded
    // subscription. The dedupe index is on an EXPRESSION (lower(email),
    // region_code, coalesce(agent_id::text,'')), which PostgREST's upsert
    // onConflict can't target by a column list — so we plain insert and treat a
    // unique-violation (23505) as "already exists": we then read the existing
    // row back to drive double opt-in.
    let row: SubRow | null = null;

    const { data: inserted, error: insertErr } = await supabaseServer
      .from("newsletter_subscriptions")
      .insert({
        email,
        region_level: regionLevel,
        region_code: regionCode,
        region_name: regionName,
        agent_id: agentId,
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
      // the dedupe key exactly (lower(email) + region_code + the same agent
      // bucket: the public bucket when agent_id is null, else this agent's).
      let existingQ = supabaseServer
        .from("newsletter_subscriptions")
        .select("id, confirm_token, confirmed_at, status")
        .eq("email", email)
        .eq("region_code", regionCode);
      existingQ =
        agentId === null
          ? existingQ.is("agent_id", null)
          : existingQ.eq("agent_id", agentId);
      const { data: existing } = await existingQ.maybeSingle();
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

    // Not yet confirmed → send the confirmation email (best-effort). When an
    // agent is attached, the confirmation is AGENT-BRANDED: from-name = the
    // agent (via RealtyBoss), reply-to = the agent's email, and the copy names
    // the agent. Loaded here (once) via loadPresentationAgent; never throws.
    if (row?.confirm_token) {
      const siteUrl = getSiteUrl().replace(/\/$/, "");
      const confirmUrl = `${siteUrl}/newsletter/confirm?token=${encodeURIComponent(
        row.confirm_token,
      )}`;

      let brand: {
        name: string | null;
        brokerage: string | null;
        email: string | null;
      } | null = null;
      if (agentId !== null) {
        try {
          const a = await loadPresentationAgent(agentId);
          if (a.name?.trim()) {
            brand = { name: a.name.trim(), brokerage: a.brokerage, email: a.email };
          }
        } catch (e) {
          console.warn("newsletter confirm: agent load failed", e);
        }
      }

      try {
        if (brand) {
          const who = brand.name ?? "your agent";
          const org = brand.brokerage?.trim() ? `, ${brand.brokerage.trim()}` : "";
          await sendEmail({
            to: email,
            from: agentNewsletterFrom(brand.name),
            replyTo: brand.email?.trim() || undefined,
            subject: `Confirm your subscription to ${who}'s weekly housing briefing`,
            text: [
              `Thanks for subscribing to ${who}${org}'s weekly housing briefing.`,
              "",
              "Please confirm your subscription by opening this link:",
              confirmUrl,
              "",
              "If you didn't request this, you can ignore this email — no issues will be sent.",
              "",
              "Powered by RealtyBoss.",
            ].join("\n"),
            html: confirmEmailHtml(confirmUrl, { name: who, brokerage: brand.brokerage }),
          });
        } else {
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
        }
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

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function confirmEmailHtml(
  confirmUrl: string,
  agent?: { name: string; brokerage: string | null },
): string {
  const safe = esc(confirmUrl);

  const header = agent
    ? `<div style="font-size:16px;font-weight:800;color:#0f172a;">${esc(agent.name)}</div>${
        agent.brokerage
          ? `<div style="font-size:12px;color:#64748b;margin-top:1px;">${esc(agent.brokerage)}</div>`
          : ""
      }`
    : `<div style="font-size:13px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:#0072ce;">RealtyBoss</div>`;

  const intro = agent
    ? `Thanks for subscribing to ${esc(agent.name)}'s weekly housing briefing — plain-English mortgage rates and housing news, paired with your region's market snapshot. Confirm below to start receiving it.`
    : `Thanks for subscribing to the RealtyBoss weekly housing briefing — plain-English mortgage rates and housing news, paired with your region's market snapshot. Confirm below to start receiving it.`;

  const footer = agent
    ? `<p style="font-size:12px;line-height:1.55;color:#94a3b8;margin:16px 0 0;">Sent by ${esc(
        agent.name,
      )}${agent.brokerage ? `, ${esc(agent.brokerage)}` : ""} · powered by RealtyBoss. If you didn't request this, ignore this email — no issues will be sent.</p>`
    : `<p style="font-size:12px;line-height:1.55;color:#94a3b8;margin:16px 0 0;">If you didn't request this, ignore this email — no issues will be sent.</p>`;

  return `<div style="background:#f8fafc;padding:24px 0;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#0f172a;">
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center" style="width:100%;max-width:560px;margin:0 auto;">
    <tr><td style="padding:0 20px;">
      ${header}
      <h1 style="font-size:20px;font-weight:800;color:#0f172a;margin:14px 0 8px;">Confirm your subscription</h1>
      <p style="font-size:15px;line-height:1.55;color:#475569;margin:0 0 16px;">${intro}</p>
      <p style="margin:0 0 20px;">
        <a href="${safe}" style="display:inline-block;background:#0072ce;color:#ffffff;font-size:15px;font-weight:700;text-decoration:none;padding:11px 20px;border-radius:8px;">Confirm subscription →</a>
      </p>
      <p style="font-size:12px;line-height:1.55;color:#94a3b8;margin:0;">If the button doesn't work, paste this link into your browser:<br/><span style="color:#64748b;">${safe}</span></p>
      ${footer}
    </td></tr>
  </table>
</div>`;
}
