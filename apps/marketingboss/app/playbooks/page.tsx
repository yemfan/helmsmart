import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import Nav from "@/components/Nav";
import Autopilot, { type ChannelOption } from "@/components/Autopilot";
import WeeklySchedule from "@/components/WeeklySchedule";
import { getConnectionStatus, getConnectionStatuses } from "@/lib/social";
import { youtubeConfigured } from "@/lib/youtube";
import { aiConfigured } from "@/lib/ai";
import { listCampaigns } from "@/lib/campaigns";
import { OAUTH_ADAPTERS } from "@/lib/oauth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SOCIAL_PLATFORMS = ["facebook", "instagram", "threads", "linkedin", "pinterest"];
const LABELS: Record<string, string> = {
  facebook: "Facebook",
  instagram: "Instagram",
  threads: "Threads",
  linkedin: "LinkedIn",
  pinterest: "Pinterest",
  youtube: "YouTube",
  tiktok: "TikTok",
};

/**
 * Playbooks — long-term strategies, not templates. Each playbook researches
 * your market, plans actions on a cadence, runs within your budget, and (soon)
 * improves from what Learning discovers.
 */
export default async function PlaybooksPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [{ data: profile }, youtube, socialStatuses, campaigns] = await Promise.all([
    supabase.from("profiles").select("credits").eq("user_id", user.id).single(),
    getConnectionStatus(user.id, "youtube"),
    getConnectionStatuses(user.id, [...SOCIAL_PLATFORMS, "tiktok"]),
    listCampaigns(user.id),
  ]);

  const channels: ChannelOption[] = [
    ...SOCIAL_PLATFORMS.map((id) => ({ id, label: LABELS[id], connected: socialStatuses[id]?.connected ?? false })),
    ...(youtubeConfigured() ? [{ id: "youtube", label: LABELS.youtube, connected: youtube.connected }] : []),
    ...(OAUTH_ADAPTERS.tiktok.configured()
      ? [{ id: "tiktok", label: LABELS.tiktok, connected: socialStatuses.tiktok?.connected ?? false }]
      : []),
  ];

  return (
    <main className="mx-auto flex min-h-dvh max-w-3xl flex-col gap-8 px-5 py-8 sm:py-12">
      <Nav email={user.email ?? ""} credits={profile?.credits ?? 0} />
      <section className="flex flex-col gap-2">
        <h2 className="text-2xl font-bold tracking-tight">📚 Playbooks</h2>
        <p className="text-sm text-slate-500">
          Long-term strategies, not one-off posts. Point us at your product or business link — the AI researches your
          market and competitors, then plans and posts on the cadence you set. You control content types, channels,
          budget, and whether it waits for your approval.
        </p>
      </section>
      <Autopilot campaigns={campaigns} channels={channels} aiConfigured={aiConfigured()} />
      <section className="flex flex-col gap-2">
        <h3 className="text-sm font-semibold text-slate-900">Built-in: Stay consistent</h3>
        <p className="text-xs text-slate-500">
          A standing playbook that keeps you posting every week — pick the days, the topic, and the format; the AI
          researches and writes each post.
        </p>
        <section className="rounded-2xl bg-white p-5 text-neutral-900 shadow-sm">
          <WeeklySchedule />
        </section>
      </section>
      <footer className="mt-auto pt-6 text-center text-[11px] text-slate-400">
        Research by Claude · content by fal.ai · you approve or let it run — always within your budget
      </footer>
    </main>
  );
}
