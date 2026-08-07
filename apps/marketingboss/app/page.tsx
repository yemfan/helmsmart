import { createClient } from "@/lib/supabase/server";
import Nav from "@/components/Nav";
import Studio from "@/components/Studio";
import { MarketingLanding } from "@/components/marketing/MarketingLanding";
import { retrieveSession } from "@/lib/stripe";
import { fulfillSession } from "@/lib/fulfill";
import { getConnectionStatus, getConnectionStatuses } from "@/lib/social";
import { youtubeConfigured } from "@/lib/youtube";
import { OAUTH_ADAPTERS } from "@/lib/oauth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SOCIAL_PLATFORMS = ["facebook", "instagram", "threads", "linkedin", "pinterest"];

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ purchased?: string; subscribed?: string; youtube?: string; social?: string; provider?: string }>;
}) {
  const sp = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  // Logged-out visitors get the public marketing homepage (marketingbossai.com)
  // instead of an immediate bounce to /login.
  if (!user) return <MarketingLanding />;

  let creditsAdded: number | null = null;
  if (sp.purchased) {
    try {
      const session = await retrieveSession(sp.purchased);
      const balance = await fulfillSession(session);
      if (balance !== null) {
        const n = Number.parseInt(session.metadata?.credits ?? "", 10);
        creditsAdded = Number.isFinite(n) ? n : 0;
      }
    } catch {
      // webhook backstops fulfillment
    }
  }

  const [{ data: profile }, youtube, socialStatuses] = await Promise.all([
    supabase.from("profiles").select("credits").eq("user_id", user.id).single(),
    getConnectionStatus(user.id, "youtube"),
    getConnectionStatuses(user.id, SOCIAL_PLATFORMS),
  ]);
  const credits = profile?.credits ?? 0;

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

  const ytNotice =
    sp.youtube === "connected"
      ? { kind: "ok" as const, text: `YouTube connected${youtube.accountName ? ` — ${youtube.accountName}` : ""}. You can publish videos now. 🎬` }
      : sp.youtube === "denied"
        ? { kind: "warn" as const, text: "YouTube connection was cancelled." }
        : sp.youtube === "error"
          ? { kind: "warn" as const, text: "Couldn't connect YouTube — please try again." }
          : null;

  const socialNotice =
    sp.social === "connected"
      ? { kind: "ok" as const, text: `${providerLabel(sp.provider)} connected. You can publish images now. ✨` }
      : sp.social === "denied"
        ? { kind: "warn" as const, text: `${providerLabel(sp.provider)} connection was cancelled.` }
        : sp.social === "error"
          ? { kind: "warn" as const, text: `Couldn't connect ${providerLabel(sp.provider)} — please try again.` }
          : null;

  return (
    <main className="mx-auto flex min-h-dvh max-w-3xl flex-col gap-8 px-5 py-8 sm:py-12">
      <Nav email={user.email ?? ""} credits={credits} />
      {creditsAdded !== null && (
        <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3.5 text-sm text-emerald-600">
          Payment received —{" "}
          {creditsAdded > 0 ? `${creditsAdded} credits added` : "your credits have been added"}. Happy
          creating! 🎬
        </div>
      )}
      {sp.subscribed && (
        <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3.5 text-sm text-emerald-600">
          You&apos;re subscribed 🎉 Your monthly credits will appear within a few seconds — refresh if the balance
          hasn&apos;t updated yet.
        </div>
      )}
      {[ytNotice, socialNotice].map((n, i) =>
        n ? (
          <div
            key={i}
            className={`rounded-xl border p-3.5 text-sm ${
              n.kind === "ok"
                ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-600"
                : "border-slate-200 bg-slate-50 text-slate-600"
            }`}
          >
            {n.text}
          </div>
        ) : null,
      )}
      <Studio
        youtubeEnabled={youtubeConfigured()}
        youtubeConnected={youtube.connected}
        youtubeChannel={youtube.accountName}
        social={{ providersConfigured, connected, accountName }}
      />
      <footer className="mt-auto pt-6 text-center text-[11px] text-slate-400">
        Powered by fal.ai · image 1 credit · edit 2 · video 20 · every render is saved to your gallery
      </footer>
    </main>
  );
}

function providerLabel(provider?: string): string {
  switch (provider) {
    case "meta":
      return "Facebook & Instagram";
    case "threads":
      return "Threads";
    case "linkedin":
      return "LinkedIn";
    case "pinterest":
      return "Pinterest";
    default:
      return "Account";
  }
}
