import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import Nav from "@/components/Nav";
import Studio from "@/components/Studio";
import { getConnectionStatus, getConnectionStatuses } from "@/lib/social";
import { youtubeConfigured } from "@/lib/youtube";
import { OAUTH_ADAPTERS } from "@/lib/oauth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SOCIAL_PLATFORMS = ["facebook", "instagram", "threads", "linkedin", "pinterest"];

/** Studio — the pro creative tools (image / video / swap). Supports the workflow; not the product. */
export default async function StudioPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [{ data: profile }, youtube, socialStatuses, { data: brandKit }] = await Promise.all([
    supabase.from("profiles").select("credits").eq("user_id", user.id).single(),
    getConnectionStatus(user.id, "youtube"),
    getConnectionStatuses(user.id, SOCIAL_PLATFORMS),
    supabase.from("brand_kits").select("brand_name").eq("user_id", user.id).maybeSingle(),
  ]);

  const providersConfigured: Record<string, boolean> = {
    meta: OAUTH_ADAPTERS.meta.configured(),
    threads: OAUTH_ADAPTERS.threads.configured(),
    linkedin: OAUTH_ADAPTERS.linkedin.configured(),
    pinterest: OAUTH_ADAPTERS.pinterest.configured(),
  };
  const connected: Record<string, boolean> = {};
  const accountName: Record<string, string | null> = {};
  for (const p of SOCIAL_PLATFORMS) {
    connected[p] = socialStatuses[p]?.connected ?? false;
    accountName[p] = socialStatuses[p]?.accountName ?? null;
  }

  return (
    <main className="mx-auto flex min-h-dvh max-w-3xl flex-col gap-8 px-5 py-8 sm:py-12">
      <Nav email={user.email ?? ""} credits={profile?.credits ?? 0} />
      <a
        href="/studio/characters"
        className="flex items-center justify-between rounded-2xl border border-boss-violet/20 bg-boss-violet/5 p-4 transition hover:border-boss-violet/40"
      >
        <div>
          <div className="text-sm font-semibold text-slate-900">🎭 Character Studio</div>
          <p className="text-xs text-slate-500">Create a persistent cast — the same recognizable presenters in every asset.</p>
        </div>
        <span className="text-sm font-medium text-boss-violet">Open →</span>
      </a>
      <Studio
        youtubeEnabled={youtubeConfigured()}
        youtubeConnected={youtube.connected}
        youtubeChannel={youtube.accountName}
        social={{ providersConfigured, connected, accountName }}
        brandName={brandKit?.brand_name ?? null}
      />
      <footer className="mt-auto pt-6 text-center text-[11px] text-slate-400">
        Powered by fal.ai · image 1 credit · edit 2 · video 20 · every render is saved to your gallery
      </footer>
    </main>
  );
}
