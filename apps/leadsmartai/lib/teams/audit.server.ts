import "server-only";

import { supabaseAdmin } from "@/lib/supabase/admin";
import { buildAuditReport, type AuditPost, type AuditReport, type ReviewFlag, type StoredAudit } from "./audit";
import { loadTeamBrand } from "./brand.server";
import { loadMemberDirectory } from "./directory.server";

/**
 * Run and store a compliance audit over the team's published posts.
 *
 * Reads the newest posts in the window for the whole roster in one bounded
 * query (the latest 5,000 — a brokerage that publishes more than that in a
 * month audits its most recent month), plus the queue rows the pre-publish
 * review flagged, and folds both through the pure rules. The stored row is
 * what the page shows until the next run.
 */

const POST_LIMIT = 5000;
const WINDOWS = new Set([7, 30, 90]);

export function normalizeAuditDays(raw: unknown): number {
  const n = Number(raw);
  return WINDOWS.has(n) ? n : 30;
}

type PostRow = { id: string; agent_id: unknown; platform: string | null; caption: string | null; external_post_url: string | null; published_at: string | null };
type FlagRow = { id: string; agent_id: unknown; platform: string | null; review_issues: unknown; published_at: string | null; published_lead_post_id: string | null };

export async function runTeamAudit(args: { teamId: string; days: number; byAgentId: string }): Promise<StoredAudit> {
  const { data: memberRows } = await supabaseAdmin.from("team_memberships").select("agent_id").eq("team_id", args.teamId).limit(3000);
  const ids = ((memberRows as { agent_id: unknown }[] | null) ?? []).map((r) => String(r.agent_id));
  const since = new Date(Date.now() - args.days * 86_400_000).toISOString();

  const [brand, posts, flags, directory] = await Promise.all([
    loadTeamBrand(args.teamId).catch(() => null),
    ids.length
      ? supabaseAdmin
          .from("lead_posts")
          .select("id, agent_id, platform, caption, external_post_url, published_at")
          .in("agent_id", ids as never[])
          .eq("status", "published")
          .gte("published_at", since)
          .order("published_at", { ascending: false })
          .limit(POST_LIMIT)
          .then((r) => (r.data as PostRow[] | null) ?? [])
      : Promise.resolve([] as PostRow[]),
    ids.length
      ? supabaseAdmin
          .from("scheduled_posts")
          .select("id, agent_id, platform, review_issues, published_at, published_lead_post_id")
          .in("agent_id", ids as never[])
          .eq("review_verdict", "flagged")
          .eq("status", "posted")
          .gte("published_at", since)
          .limit(POST_LIMIT)
          .then((r) => (r.data as FlagRow[] | null) ?? [])
      : Promise.resolve([] as FlagRow[]),
    loadMemberDirectory(args.teamId),
  ]);

  const auditPosts: AuditPost[] = posts.map((p) => ({
    id: p.id,
    agentId: String(p.agent_id),
    platform: p.platform,
    caption: p.caption ?? "",
    url: p.external_post_url,
    publishedAt: p.published_at,
  }));
  const urlByPost = new Map(auditPosts.map((p) => [p.id, p.url]));
  const reviewFlags: ReviewFlag[] = flags.map((f) => {
    const issues = Array.isArray(f.review_issues) ? (f.review_issues as { why?: string; quote?: string }[]) : [];
    const first = issues[0];
    const postId = f.published_lead_post_id ?? f.id;
    return {
      postId,
      agentId: String(f.agent_id),
      platform: f.platform,
      url: urlByPost.get(postId) ?? null,
      publishedAt: f.published_at,
      issue: first?.why ? `${first.why}${first.quote ? ` — "${first.quote}"` : ""}` : "flagged by the claim review",
    };
  });

  const report = buildAuditReport(auditPosts, reviewFlags, { brokerageName: brand?.name ?? null, license: brand?.license ?? null });
  const summary = { byKind: report.byKind, agentsFlagged: report.agentsFlagged, postsFlagged: report.postsFlagged };
  const { data, error } = await supabaseAdmin
    .from("team_audits")
    .insert({ team_id: args.teamId, ran_by_agent_id: args.byAgentId, window_days: args.days, posts_reviewed: report.postsReviewed, summary, findings: report.findings } as never)
    .select("id, ran_at")
    .single();
  if (error) throw new Error(`audit store failed: ${error.message}`);
  const row = data as { id: string; ran_at: string };
  return { id: row.id, ranAt: row.ran_at, ranBy: args.byAgentId, days: args.days, report, directory };
}

export async function loadLatestAudit(teamId: string): Promise<StoredAudit | null> {
  const { data } = await supabaseAdmin
    .from("team_audits")
    .select("id, ran_at, ran_by_agent_id, window_days, posts_reviewed, summary, findings")
    .eq("team_id", teamId)
    .order("ran_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!data) return null;
  const row = data as { id: string; ran_at: string; ran_by_agent_id: unknown; window_days: number; posts_reviewed: number; summary: Partial<AuditReport>; findings: AuditReport["findings"] };
  const directory = await loadMemberDirectory(teamId);
  const findings = Array.isArray(row.findings) ? row.findings : [];
  const report: AuditReport = {
    postsReviewed: row.posts_reviewed,
    findings,
    byKind: row.summary?.byKind ?? {},
    agentsFlagged: row.summary?.agentsFlagged ?? new Set(findings.map((f) => f.agentId)).size,
    postsFlagged: row.summary?.postsFlagged ?? new Set(findings.map((f) => f.postId)).size,
  };
  return { id: row.id, ranAt: row.ran_at, ranBy: String(row.ran_by_agent_id), days: row.window_days, report, directory };
}
