import type { Metadata } from "next";
import { getCurrentAgentContext } from "@/lib/dashboardService";
import { supabaseAdmin } from "@/lib/supabase/admin";
import {
  currentWeekOf,
  getConnectedSocialAccounts,
  getSocialMode,
  listRecommendations,
  recommendationImageUrl,
} from "@/lib/social/recommend";
import MarketingAssistantClient, { type MarketingData } from "./MarketingAssistantClient";
import type { SocialRec } from "@/components/marketing/WeeklySocialPosts";
import { getSiteUrl } from "@/lib/siteUrl";
import { loadPresentationAgent } from "@/lib/presentations/loadPresentationAgent";
import { agentHasSocialCustomization } from "@/lib/social/customization";
import { getServerT } from "@/lib/i18n/server";

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
  const t = await getServerT();
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
  const [socialRecsRaw, socialMode, connectedAccounts, canCustomize] = await Promise.all([
    listRecommendations(String(agentId), weekOf).catch(() => []),
    getSocialMode(String(agentId)).catch(() => "ask" as const),
    getConnectedSocialAccounts(String(agentId)).catch(() => []),
    agentHasSocialCustomization(String(agentId)).catch(() => false),
  ]);
  // Map connected accounts → the human-facing platform labels the UI shows
  // ('meta' → 'Facebook'), deduped. Empty = no account connected.
  const connectedPlatforms = Array.from(
    new Set(
      connectedAccounts.map((a) => (a.platform === "linkedin" ? "LinkedIn" : "Facebook")),
    ),
  );
  // Attach the branded-image URL for the UI (thumbnail + preview modal): the
  // stored asset first, on-the-fly /api/social/card/[id] as a fallback.
  const socialRecs: SocialRec[] = socialRecsRaw.map((r) => ({
    ...r,
    imageUrl: r.image_url ?? recommendationImageUrl(r.id),
    image_source: r.image_source ?? null,
  })) as SocialRec[];

  // "Your Client Newsletter" card (Phase 3): the agent's shareable signup link
  // + their confirmed-subscriber count. Best-effort — never break the page.
  const newsletter = await loadClientNewsletter(agentId);

  return (
    <MarketingAssistantClient
      data={data}
      social={{
        weekOf,
        mode: socialMode,
        recs: socialRecs,
        connectedPlatforms,
        canCustomize,
      }}
      newsletter={newsletter}
    />
  );
}

export type ClientNewsletterData = {
  shareUrl: string;
  subscriberCount: number;
  agentName: string | null;
} | null;

async function loadClientNewsletter(
  agentId: string | number,
): Promise<ClientNewsletterData> {
  try {
    const [tokenRow, countRes, agent] = await Promise.all([
      supabaseAdmin
        .from("agents")
        .select("newsletter_token")
        .eq("id", agentId as never)
        .maybeSingle(),
      supabaseAdmin
        .from("newsletter_subscriptions")
        .select("id", { count: "exact", head: true })
        .eq("agent_id", agentId as never)
        .eq("status", "subscribed")
        .not("confirmed_at", "is", null),
      loadPresentationAgent(agentId).catch(() => null),
    ]);

    const token = (tokenRow.data as { newsletter_token: string | null } | null)
      ?.newsletter_token;
    if (!token) return null;

    const base = getSiteUrl().replace(/\/$/, "");
    return {
      shareUrl: `${base}/newsletter/a/${token}`,
      subscriberCount: countRes.count ?? 0,
      agentName: agent?.name?.trim() || null,
    };
  } catch (e) {
    console.warn("[marketing] client newsletter load failed", e);
    return null;
  }
}
