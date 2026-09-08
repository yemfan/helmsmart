import { NextResponse } from "next/server";

import { getAgentDisplayName } from "@/lib/ai-call/lead-resolution";
import { sendEmail } from "@/lib/email";
import { getSiteUrl } from "@/lib/siteUrl";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { generateInviteToken } from "@/lib/teams/inviteToken";

export const runtime = "nodejs";
export const maxDuration = 120;

/**
 * Every 5 minutes: email the team invitations that are queued.
 *
 * Invitations used to be copied out of the page by hand. A roster of a
 * thousand agents cannot be, so inviting queues a row and this sends it:
 * a bounded batch, oldest first, three attempts, and the error kept on the
 * row so the board can say "bounced" instead of "pending" forever.
 *
 * The raw accept token is never stored — only its hash — so the mailer
 * cannot rebuild a link for an existing token. It issues a fresh one and
 * writes the new hash in the same update, which is why sending also rotates
 * the token. A person who clicks an older link gets "not found" and the
 * newer email; that is the safe direction.
 */

const BATCH = 40;
const MAX_ATTEMPTS = 3;

function authorize(req: Request): boolean {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) return false;
  return (req.headers.get("authorization") ?? "") === `Bearer ${secret}`;
}

type Row = {
  id: string;
  team_id: string;
  invited_email: string;
  invited_name: string | null;
  invited_by_agent_id: string | number;
  email_attempts: number | null;
  teams: { name: string } | { name: string }[] | null;
};

export async function GET(req: Request) {
  if (!authorize(req)) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  const startedAt = Date.now();
  const nowIso = new Date().toISOString();

  const { data, error } = await supabaseAdmin
    .from("team_invites")
    .select("id, team_id, invited_email, invited_name, invited_by_agent_id, email_attempts, teams!inner(name)")
    .is("email_sent_at", null)
    .is("accepted_at", null)
    .gt("expires_at", nowIso)
    .lt("email_attempts", MAX_ATTEMPTS)
    .order("created_at", { ascending: true })
    .limit(BATCH);
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

  const rows = (data as Row[] | null) ?? [];
  const inviterNames = new Map<string, string | null>();
  const origin = getSiteUrl();
  let sent = 0;
  let failed = 0;

  for (const row of rows) {
    const inviterId = String(row.invited_by_agent_id);
    if (!inviterNames.has(inviterId)) inviterNames.set(inviterId, await getAgentDisplayName(inviterId).catch(() => null));
    const inviter = inviterNames.get(inviterId) ?? null;
    const teamName = (Array.isArray(row.teams) ? row.teams[0]?.name : row.teams?.name) ?? "the team";

    // A fresh token for this email; its hash replaces the old one below.
    const { rawToken, tokenHash } = generateInviteToken();
    const acceptUrl = `${origin}/team/accept/${rawToken}`;
    const first = (row.invited_name ?? "").split(" ")[0] || null;
    const who = inviter ? `${inviter} has invited you` : "You have been invited";
    const subject = inviter ? `${inviter} invited you to join ${teamName} on CloseBoss` : `You are invited to join ${teamName} on CloseBoss`;
    const text = [
      first ? `Hi ${first},` : "Hi,",
      "",
      `${who} to join ${teamName} on CloseBoss, the AI team for real estate agents: a receptionist that answers your calls, a sales assistant that follows up, and a marketing hub with your own lead page.`,
      "",
      `Accept the invitation: ${acceptUrl}`,
      "",
      "If you do not have a CloseBoss account yet, the link will let you create one first; it then joins you to the team.",
      "",
      "The link is good for 14 days. If it expires, ask your broker to send another.",
    ].join("\n");
    const html = `
      <div style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;font-size:15px;line-height:1.5;color:#0f172a">
        <p>${first ? `Hi ${escapeHtml(first)},` : "Hi,"}</p>
        <p>${escapeHtml(who)} to join <strong>${escapeHtml(teamName)}</strong> on CloseBoss, the AI team for real estate agents: a receptionist that answers your calls, a sales assistant that follows up, and a marketing hub with your own lead page.</p>
        <p style="margin:24px 0"><a href="${acceptUrl}" style="background:#0072ce;color:#fff;text-decoration:none;padding:12px 20px;border-radius:8px;font-weight:600;display:inline-block">Accept the invitation</a></p>
        <p style="color:#475569;font-size:13px">If you do not have a CloseBoss account yet, the link lets you create one first and then joins you to the team. The link is good for 14 days; if it expires, ask your broker to send another.</p>
        <p style="color:#94a3b8;font-size:12px">Or paste this into your browser: ${acceptUrl}</p>
      </div>`;

    try {
      const r = await sendEmail({ to: row.invited_email, subject, text, html });
      if (!r?.id && process.env.RESEND_API_KEY) throw new Error("Resend returned no message id");
      const { error: upErr } = await supabaseAdmin
        .from("team_invites")
        .update({ token_hash: tokenHash, email_sent_at: new Date().toISOString(), email_error: null, email_attempts: (row.email_attempts ?? 0) + 1 } as never)
        .eq("id", row.id);
      if (upErr) throw new Error(upErr.message);
      sent += 1;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      failed += 1;
      await supabaseAdmin
        .from("team_invites")
        .update({ email_error: msg.slice(0, 300), email_attempts: (row.email_attempts ?? 0) + 1 } as never)
        .eq("id", row.id);
    }
    if (Date.now() - startedAt > 90_000) break;
  }

  return NextResponse.json({ ok: true, picked: rows.length, sent, failed });
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] ?? c);
}
