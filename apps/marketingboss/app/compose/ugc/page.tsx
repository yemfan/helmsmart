import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import Nav from "@/components/Nav";
import UgcStudio, { type ChannelOption } from "@/components/UgcStudio";
import { getConnectionStatus } from "@/lib/social";
import { youtubeConfigured } from "@/lib/youtube";
import { aiConfigured } from "@/lib/ai";
import { OAUTH_ADAPTERS } from "@/lib/oauth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default async function UgcPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [{ data: profile }, youtube, tiktok] = await Promise.all([
    supabase.from("profiles").select("credits").eq("user_id", user.id).single(),
    getConnectionStatus(user.id, "youtube"),
    getConnectionStatus(user.id, "tiktok"),
  ]);

  // UGC = short-form video → the video-capable channels.
  const channels: ChannelOption[] = [
    ...(OAUTH_ADAPTERS.tiktok.configured()
      ? [{ id: "tiktok", label: "TikTok", connected: tiktok.connected, connectPath: "/api/social/connect/tiktok" }]
      : []),
    ...(youtubeConfigured()
      ? [{ id: "youtube", label: "YouTube", connected: youtube.connected, connectPath: "/api/youtube/connect" }]
      : []),
  ];

  return (
    <main className="mx-auto flex min-h-dvh max-w-3xl flex-col gap-8 px-5 py-8 sm:py-12">
      <Nav email={user.email ?? ""} credits={profile?.credits ?? 0} />
      <section className="flex flex-col gap-1">
        <Link href="/compose" className="text-xs text-white/45 transition hover:text-white">
          ← Posting
        </Link>
        <h2 className="text-2xl font-bold tracking-tight">UGC ad</h2>
        <p className="text-sm text-white/50">
          AI writes an authentic creator-style ad and films it — a person talking to camera with real voice (Seedance).
          Drop in a reference image or a viral ad to emulate its style.
        </p>
      </section>
      <UgcStudio channels={channels} aiConfigured={aiConfigured()} />
      <footer className="mt-auto pt-6 text-center text-[11px] text-white/25">
        Script by Claude · video + voice by Seedance · a UGC clip costs 35 credits
      </footer>
    </main>
  );
}
