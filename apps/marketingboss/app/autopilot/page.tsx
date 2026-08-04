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

export default async function AutopilotPage() {
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
        <h2 className="text-2xl font-bold tracking-tight">Autopilot marketing</h2>
        <p className="text-sm text-slate-500">
          Point us at your product or business link. AI researches your market and competitors, then plans and posts
          content on the cadence you set — you control the content types, channels, and budget.
        </p>
      </section>
      <Autopilot campaigns={campaigns} channels={channels} aiConfigured={aiConfigured()} />
      <section className="rounded-2xl bg-white p-5 text-neutral-900 shadow-sm">
        <WeeklySchedule />
      </section>
      <footer className="mt-auto pt-6 text-center text-[11px] text-slate-400">
        Research by Claude · content by fal.ai · you approve or let it run — always within your budget
      </footer>
    </main>
  );
}
