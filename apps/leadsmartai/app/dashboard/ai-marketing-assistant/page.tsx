import type { Metadata } from "next";
import { getCurrentAgentContext } from "@/lib/dashboardService";
import { supabaseAdmin } from "@/lib/supabase/admin";
import {
  currentWeekOf,
  getSocialMode,
  listRecommendations,
  recommendationImageUrl,
} from "@/lib/social/recommend";
import MarketingAssistantClient, { type MarketingData } from "./MarketingAssistantClient";
import type { SocialRec } from "@/components/marketing/WeeklySocialPosts";

export const metadata: Metadata = {
  title: "Marketing Assistant",
  description: "Your AI Marketing Assistant — social content, marketing plans, and sphere nurture.",
  robots: { index: false },
};

export const dynamic = "force-dynamic";

/**
 * /dashboard/ai-marketing-assistant — demand generation overview.
 * Server-composed over the marketing surfaces the assistant runs:
 * scheduled social posts, marketing plans, templates, and new leads.
 */
export default async function MarketingAssistantPage() {
  const { agentId } = await getCurrentAgentContext();
  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);
  const since30 = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

  const [postsScheduled, postsPublished, plansActive, templatesCount, newLeads, upcoming, activities] =
    await Promise.all([
      supabaseAdmin
        .from("scheduled_posts")
        .select("id", { count: "exact", head: true })
        .eq("agent_id", agentId)
        .eq("status", "scheduled"),
      supabaseAdmin
        .from("scheduled_posts")
        .select("id", { count: "exact", head: true })
        .eq("agent_id", agentId)
        .eq("status", "posted")
        .gte("published_at", since30),
      // lead_sequences is lead-keyed (legacy) — same account-level count
      // the marketing hub shows.
      supabaseAdmin
        .from("lead_sequences")
        .select("id", { count: "exact", head: true })
        .eq("status", "active"),
      supabaseAdmin.from("message_templates").select("id", { count: "exact", head: true }),
      supabaseAdmin
        .from("contacts")
        .select("id", { count: "exact", head: true })
        .eq("agent_id", agentId)
        .gte("created_at", monthStart.toISOString()),
      supabaseAdmin
        .from("scheduled_posts")
        .select("id, platform, caption, scheduled_for, status")
        .eq("agent_id", agentId)
        .eq("status", "scheduled")
        .order("scheduled_for", { ascending: true })
        .limit(5),
      supabaseAdmin
        .from("assistant_activities")
        .select("id, activity_type, summary, outcome, created_at, requires_attention")
        .eq("agent_id", agentId)
        .eq("assistant_type", "marketing_assistant")
        .order("created_at", { ascending: false })
        .limit(10),
    ]);

  const data: MarketingData = {
    postsScheduled: postsScheduled.count ?? 0,
    postsPublished30d: postsPublished.count ?? 0,
    plansActive: plansActive.count ?? 0,
    templates: templatesCount.count ?? 0,
    newLeadsThisMonth: newLeads.count ?? 0,
    upcomingPosts: ((upcoming.data ?? []) as MarketingData["upcomingPosts"]) || [],
    activities: ((activities.data ?? []) as MarketingData["activities"]) || [],
  };

  // This week's social queue for the Marketing Assistant section. Best-effort:
  // if the tables are empty / not yet seeded, these return safe empties so the
  // page still renders (empty state prompts "Generate this week's posts").
  const weekOf = currentWeekOf();
  const [socialRecsRaw, socialMode] = await Promise.all([
    listRecommendations(String(agentId), weekOf).catch(() => []),
    getSocialMode(String(agentId)).catch(() => "ask" as const),
  ]);
  // Attach the branded-image URL for the UI (thumbnail + preview modal): the
  // stored asset first, on-the-fly /api/social/card/[id] as a fallback.
  const socialRecs: SocialRec[] = socialRecsRaw.map((r) => ({
    ...r,
    imageUrl: r.image_url ?? recommendationImageUrl(r.id),
  })) as SocialRec[];

  return (
    <MarketingAssistantClient
      data={data}
      social={{
        weekOf,
        mode: socialMode,
        recs: socialRecs,
      }}
    />
  );
}
