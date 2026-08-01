import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import Nav from "@/components/Nav";
import Compose from "@/components/Compose";
import { getConnectionStatus, getConnectionStatuses } from "@/lib/social";
import { youtubeConfigured } from "@/lib/youtube";
import { aiConfigured } from "@/lib/ai";
import { OAUTH_ADAPTERS } from "@/lib/oauth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SOCIAL_PLATFORMS = ["facebook", "instagram", "threads", "linkedin", "pinterest", "tiktok"];

export default async function NewAIPostPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [{ data: profile }, youtube, socialStatuses] = await Promise.all([
    supabase.from("profiles").select("credits").eq("user_id", user.id).single(),
    getConnectionStatus(user.id, "youtube"),
    getConnectionStatuses(user.id, SOCIAL_PLATFORMS),
  ]);

  const providersConfigured: Record<string, boolean> = {
    meta: OAUTH_ADAPTERS.meta.configured(),
    threads: OAUTH_ADAPTERS.threads.configured(),
    linkedin: OAUTH_ADAPTERS.linkedin.configured(),
    pinterest: OAUTH_ADAPTERS.pinterest.configured(),
    tiktok: OAUTH_ADAPTERS.tiktok.configured(),
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
      <section className="flex flex-col gap-1">
        <Link href="/compose" className="text-xs text-white/45 transition hover:text-white">
          ← Posting
        </Link>
        <h2 className="text-2xl font-bold tracking-tight">AI posting</h2>
        <p className="text-sm text-white/50">
          Tell the AI what to say. It writes the post, makes the visual, tailors a caption per channel, and posts now —
          or schedules it for later.
        </p>
      </section>
      <Compose
        status={{
          providersConfigured,
          connected,
          accountName,
          youtubeEnabled: youtubeConfigured(),
          youtubeConnected: youtube.connected,
          youtubeChannel: youtube.accountName,
          aiConfigured: aiConfigured(),
        }}
      />
    </main>
  );
}
