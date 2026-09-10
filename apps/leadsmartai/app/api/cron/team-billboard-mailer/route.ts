import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { sendEmail } from "@/lib/email";
import { getSiteUrl } from "@/lib/siteUrl";
import { getAgentDisplayName } from "@/lib/ai-call/lead-resolution";
import { announcementEmail } from "@/lib/teams/billboard";
import { loadMemberDirectory } from "@/lib/teams/directory.server";
import { loadTeamBrand } from "@/lib/teams/brand.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

/**
 * Every 5 minutes: send the billboard posts a manager asked to email.
 * One queue row per member was written when the post went up; this takes
 * a few hundred at a time, oldest first, and records each send on its own
 * row, so a 1,200-agent office finishes within the half hour and a crash
 * mid-batch cannot double-send.
 */

const BATCH = 200;
const MAX_ATTEMPTS = 3;
const PARALLEL = 10;

function authorize(req: Request): boolean {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) return false;
  return (req.headers.get("authorization") ?? "") === `Bearer ${secret}`;
}

type QueueRow = {
  id: string;
  announcement_id: string;
  agent_id: unknown;
  attempts: number;
  team_announcements: { team_id: string; kind: "news" | "win" | "event" | "reminder" | "policy" | "welcome"; title: string; body: string | null; link_url: string | null; author_agent_id: unknown } | null;
};

export async function GET(req: Request) {
  if (!authorize(req)) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  const { data, error } = await supabaseAdmin
    .from("team_announcement_emails")
    .select("id, announcement_id, agent_id, attempts, team_announcements!inner(team_id, kind, title, body, link_url, author_agent_id)")
    .is("sent_at", null)
    .lt("attempts", MAX_ATTEMPTS)
    .order("created_at", { ascending: true })
    .limit(BATCH);
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  const rows = ((data as unknown as QueueRow[] | null) ?? []).filter((r) => r.team_announcements);
  if (!rows.length) return NextResponse.json({ ok: true, sent: 0, failed: 0 });

  const origin = getSiteUrl().replace(/\/$/, "");
  const teamIds = [...new Set(rows.map((r) => r.team_announcements!.team_id))];
  const directories = new Map<string, Awaited<ReturnType<typeof loadMemberDirectory>>>();
  const brokerages = new Map<string, string>();
  for (const teamId of teamIds) {
    const [dir, brand, team] = await Promise.all([loadMemberDirectory(teamId), loadTeamBrand(teamId).catch(() => null), supabaseAdmin.from("teams").select("name").eq("id", teamId).maybeSingle()]);
    directories.set(teamId, dir);
    brokerages.set(teamId, brand?.name ?? (team.data as { name?: string } | null)?.name ?? "Your brokerage");
  }
  const authors = new Map<string, string | null>();
  const authorName = async (id: unknown) => {
    if (id == null) return null;
    const key = String(id);
    if (!authors.has(key)) authors.set(key, await getAgentDisplayName(key).catch(() => null));
    return authors.get(key) ?? null;
  };

  let sent = 0;
  let failed = 0;
  for (let i = 0; i < rows.length; i += PARALLEL) {
    await Promise.all(
      rows.slice(i, i + PARALLEL).map(async (r) => {
        const a = r.team_announcements!;
        const who = directories.get(a.team_id)?.[String(r.agent_id)];
        const now = new Date().toISOString();
        if (!who?.email) {
          await supabaseAdmin.from("team_announcement_emails").update({ attempts: MAX_ATTEMPTS, error: "no email on file" } as never).eq("id", r.id);
          failed += 1;
          return;
        }
        try {
          const msg = announcementEmail(a.kind === "welcome" ? { ...a, kind: "news", linkUrl: a.link_url } : { kind: a.kind, title: a.title, body: a.body, linkUrl: a.link_url }, {
            first: (who.name ?? "").trim().split(/\s+/)[0] || null,
            brokerage: brokerages.get(a.team_id) ?? "Your brokerage",
            author: await authorName(a.author_agent_id),
            origin,
          });
          await sendEmail({ to: who.email, subject: msg.subject, text: msg.text, html: msg.html });
          await supabaseAdmin.from("team_announcement_emails").update({ sent_at: now, attempts: r.attempts + 1, error: null } as never).eq("id", r.id);
          sent += 1;
        } catch (e) {
          await supabaseAdmin.from("team_announcement_emails").update({ attempts: r.attempts + 1, error: (e instanceof Error ? e.message : String(e)).slice(0, 500) } as never).eq("id", r.id);
          failed += 1;
        }
      }),
    );
  }
  return NextResponse.json({ ok: true, sent, failed, remaining: rows.length === BATCH ? "more" : 0 });
}
