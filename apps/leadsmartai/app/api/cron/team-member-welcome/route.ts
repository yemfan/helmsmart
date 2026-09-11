import { NextResponse } from "next/server";

import { sendEmail } from "@/lib/email";
import { getSiteUrl } from "@/lib/siteUrl";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { normalizeBrand } from "@/lib/teams/brand";
import { memberWelcomeEmail, WELCOME_MAX_AGE_DAYS, WELCOME_MAX_ATTEMPTS } from "@/lib/teams/memberWelcome";

export const runtime = "nodejs";
export const maxDuration = 120;

/**
 * Every 5 minutes: tell people they were added to a team, with a link to it.
 *
 * Works off team_memberships.welcome_email_sent_at, so it covers every way a
 * membership is made — an accepted invitation, or a direct add — without each
 * path having to remember to send. Owners are never queued (the migration and
 * the role filter both say so). Bounded batch, oldest first, three attempts,
 * the error kept on the row, and nothing older than two weeks: a membership
 * that sat unsent that long is not news anymore.
 */

const BATCH = 100;

function authorize(req: Request): boolean {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) return false;
  return (req.headers.get("authorization") ?? "") === `Bearer ${secret}`;
}

type Row = {
  team_id: string;
  agent_id: unknown;
  role: "owner" | "manager" | "member";
  welcome_email_attempts: number | null;
  teams: { name: string; brand: unknown; owner_agent_id: unknown } | { name: string; brand: unknown; owner_agent_id: unknown }[] | null;
};

async function personOf(agentId: string): Promise<{ email: string | null; name: string | null }> {
  const { data: agent } = await supabaseAdmin.from("agents").select("auth_user_id").eq("id", agentId as never).maybeSingle();
  const uid = (agent as { auth_user_id?: string | null } | null)?.auth_user_id;
  if (!uid) return { email: null, name: null };
  const { data: prof } = await supabaseAdmin.from("user_profiles").select("email, full_name").eq("user_id", uid).maybeSingle();
  const p = prof as { email?: string | null; full_name?: string | null } | null;
  return { email: p?.email?.trim() || null, name: p?.full_name?.trim() || null };
}

export async function GET(req: Request) {
  if (!authorize(req)) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  const startedAt = Date.now();
  const since = new Date(Date.now() - WELCOME_MAX_AGE_DAYS * 86_400_000).toISOString();

  const { data, error } = await supabaseAdmin
    .from("team_memberships")
    .select("team_id, agent_id, role, welcome_email_attempts, teams!inner(name, brand, owner_agent_id)")
    .is("welcome_email_sent_at", null)
    .in("role", ["member", "manager"])
    .gte("created_at", since)
    .lt("welcome_email_attempts", WELCOME_MAX_ATTEMPTS)
    .order("created_at", { ascending: true })
    .limit(BATCH);
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  const rows = (data as unknown as Row[] | null) ?? [];
  const origin = getSiteUrl().replace(/\/$/, "");
  const owners = new Map<string, { email: string | null; name: string | null }>();

  let sent = 0;
  let failed = 0;
  for (const row of rows) {
    const team = Array.isArray(row.teams) ? row.teams[0] : row.teams;
    const agentId = String(row.agent_id);
    const record = (patch: Record<string, unknown>) =>
      supabaseAdmin.from("team_memberships").update(patch as never).eq("team_id", row.team_id).eq("agent_id", agentId as never);
    try {
      if (!team) throw new Error("team not found");
      const person = await personOf(agentId);
      if (!person.email) {
        // Nothing to send to; stop retrying rather than spin every 5 minutes.
        await record({ welcome_email_attempts: WELCOME_MAX_ATTEMPTS, welcome_email_error: "no email on file" });
        failed += 1;
        continue;
      }
      const ownerKey = String(team.owner_agent_id);
      if (!owners.has(ownerKey)) owners.set(ownerKey, await personOf(ownerKey));
      const owner = owners.get(ownerKey)!;
      const { count: licenses } = await supabaseAdmin.from("agent_licenses").select("agent_id", { count: "exact", head: true }).eq("agent_id", agentId as never);
      const brand = normalizeBrand(team.brand);
      const msg = memberWelcomeEmail({
        first: (person.name ?? "").split(/\s+/)[0] || null,
        teamName: brand?.name ?? team.name,
        role: row.role === "manager" ? "manager" : "member",
        needsLicense: (licenses ?? 0) === 0,
        ownerName: owner.name,
        origin,
      });
      const r = await sendEmail({ to: person.email, subject: msg.subject, text: msg.text, html: msg.html, replyTo: owner.email ?? undefined });
      if (!r?.id && process.env.RESEND_API_KEY) throw new Error("Resend returned no message id");
      const { error: upErr } = await record({ welcome_email_sent_at: new Date().toISOString(), welcome_email_error: null, welcome_email_attempts: (row.welcome_email_attempts ?? 0) + 1 });
      if (upErr) throw new Error(upErr.message);
      sent += 1;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      failed += 1;
      await record({ welcome_email_error: msg.slice(0, 300), welcome_email_attempts: (row.welcome_email_attempts ?? 0) + 1 });
    }
    if (Date.now() - startedAt > 90_000) break;
  }

  return NextResponse.json({ ok: true, picked: rows.length, sent, failed });
}
