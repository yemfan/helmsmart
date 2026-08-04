import { Metadata } from "next";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { SocialComposer } from "@/components/social-composer";
import { ResponsibleEmployee } from "@/components/responsible-employee";
import { EmilyDraftButton } from "@/components/emily-draft-button";
import { SocialAutopilotPanel } from "@/components/social-autopilot-panel";

export const metadata: Metadata = { title: "Social" };

export default async function SocialPage({
  searchParams,
}: {
  searchParams: Promise<{
    linkedin?: string;
    linkedin_error?: string;
    meta?: string;
    meta_error?: string;
    page?: string;
    ig?: string;
    threads?: string;
    threads_error?: string;
    tiktok?: string;
    tiktok_error?: string;
    youtube?: string;
    youtube_error?: string;
  }>;
}) {
  const cookieStore = await cookies();
  const orgId = cookieStore.get("helmsmart-org-id")?.value ?? "";
  const supabase = await createClient();
  const sp = await searchParams;

  // `last_error` arrives in migration 00078. HelmSmart migrations are applied by
  // hand while Vercel deploys on merge, so there's a window where this code is
  // live and the column isn't — and PostgREST fails the WHOLE select on an
  // unknown column, which would blank the page rather than degrade. Ask for it,
  // fall back to the base columns if it isn't there yet.
  const BASE_COLS =
    "id, platform, content, status, scheduled_at, published_at, published_url, generated_by_ai, ai_prompt, tone, created_at, media_url";
  const postsQuery = async () => {
    const withError = await supabase
      .from("social_posts")
      .select(`${BASE_COLS}, last_error`)
      .eq("organization_id", orgId)
      .order("created_at", { ascending: false });
    if (!withError.error) return withError;
    return supabase
      .from("social_posts")
      .select(BASE_COLS)
      .eq("organization_id", orgId)
      .order("created_at", { ascending: false });
  };

  const [{ data: posts }, { data: org }, { data: tokens }] = await Promise.all([
    postsQuery(),
    supabase
      .from("organizations")
      .select("name")
      .eq("id", orgId)
      .single(),
    // One read for every provider — a second .eq() query per platform would
    // grow with each integration.
    supabase
      .from("org_oauth_tokens")
      .select("provider")
      .eq("organization_id", orgId),
  ]);

  const connected = new Set(
    ((tokens ?? []) as { provider: string }[]).map((t) => t.provider),
  );
  const linkedinConnected = connected.has("linkedin");
  const metaConnected = connected.has("meta");
  const threadsConnected = connected.has("threads");
  const tiktokConnected = connected.has("tiktok");
  const youtubeConnected = connected.has("youtube");

  return (
    <div className="flex flex-col h-full">
      {sp.linkedin === "connected" && (
        <div className="mx-4 mt-3 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm text-emerald-800">
          LinkedIn connected. Scheduled LinkedIn posts will now publish automatically.
        </div>
      )}
      {sp.linkedin_error && (
        <div className="mx-4 mt-3 rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-800">
          Couldn&apos;t connect LinkedIn ({sp.linkedin_error.replace(/_/g, " ")}). Please try again.
        </div>
      )}
      {sp.meta === "connected" && (
        <div className="mx-4 mt-3 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm text-emerald-800">
          {/* Naming the Page matters: connecting the wrong one and finding out
              when a post appears on it is a genuinely bad surprise. */}
          Connected to <strong>{sp.page || "your Facebook Page"}</strong>. Scheduled
          Facebook posts will now publish automatically.
          {sp.ig === "unlinked" && (
            <>
              {" "}
              Instagram isn&apos;t available yet — no Instagram Business account is
              linked to that Page. Link one in Meta Business Suite, then reconnect.
            </>
          )}
        </div>
      )}
      {sp.meta_error && (
        <div className="mx-4 mt-3 rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-800">
          {sp.meta_error === "no_pages_granted" ? (
            <>
              No Facebook Page was shared with the app. Reconnect and tick the Page
              you want to post to on Meta&apos;s permissions screen.
            </>
          ) : (
            <>Couldn&apos;t connect Facebook ({sp.meta_error.replace(/_/g, " ")}). Please try again.</>
          )}
        </div>
      )}
      {sp.threads === "connected" && (
        <div className="mx-4 mt-3 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm text-emerald-800">
          Threads connected. Scheduled Threads posts will now publish automatically.
        </div>
      )}
      {sp.threads_error && (
        <div className="mx-4 mt-3 rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-800">
          Couldn&apos;t connect Threads ({sp.threads_error.replace(/_/g, " ")}). Please try again.
        </div>
      )}
      {sp.tiktok === "connected" && (
        <div className="mx-4 mt-3 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm text-emerald-800">
          TikTok connected. Video posting to TikTok is coming soon.
        </div>
      )}
      {sp.tiktok_error && (
        <div className="mx-4 mt-3 rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-800">
          Couldn&apos;t connect TikTok ({sp.tiktok_error.replace(/_/g, " ")}). Please try again.
        </div>
      )}
      {sp.youtube === "connected" && (
        <div className="mx-4 mt-3 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm text-emerald-800">
          YouTube connected. Video uploads to YouTube are coming soon.
        </div>
      )}
      {sp.youtube_error && (
        <div className="mx-4 mt-3 rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-800">
          Couldn&apos;t connect YouTube ({sp.youtube_error.replace(/_/g, " ")}). Please try again.
        </div>
      )}
      <SocialAutopilotPanel />
      <SocialComposer
        posts={(posts ?? []) as Parameters<typeof SocialComposer>[0]["posts"]}
        orgName={org?.name ?? "My Business"}
        owner={
          <div className="flex items-center gap-4">
            <ResponsibleEmployee slug="emily" />
            <EmilyDraftButton />
            {linkedinConnected ? (
              <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-700">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                LinkedIn connected
              </span>
            ) : (
              <a
                href="/api/auth/linkedin"
                className="inline-flex items-center gap-1.5 rounded-full border border-[#0a66c2] bg-[#0a66c2] px-3 py-1 text-xs font-medium text-white hover:opacity-90"
              >
                Connect LinkedIn
              </a>
            )}
            {/* One Meta grant covers both Facebook and Instagram. */}
            {metaConnected ? (
              <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-700">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                Facebook connected
              </span>
            ) : (
              <a
                href="/api/auth/meta"
                className="inline-flex items-center gap-1.5 rounded-full border border-[#1877f2] bg-[#1877f2] px-3 py-1 text-xs font-medium text-white hover:opacity-90"
              >
                Connect Facebook
              </a>
            )}
            {threadsConnected ? (
              <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-700">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                Threads connected
              </span>
            ) : (
              <a
                href="/api/auth/threads"
                className="inline-flex items-center gap-1.5 rounded-full border border-black bg-black px-3 py-1 text-xs font-medium text-white hover:opacity-90"
              >
                Connect Threads
              </a>
            )}
            {tiktokConnected ? (
              <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-700">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                TikTok connected
              </span>
            ) : (
              <a
                href="/api/auth/tiktok"
                className="inline-flex items-center gap-1.5 rounded-full border border-black bg-black px-3 py-1 text-xs font-medium text-white hover:opacity-90"
              >
                Connect TikTok
              </a>
            )}
            {youtubeConnected ? (
              <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-700">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                YouTube connected
              </span>
            ) : (
              <a
                href="/api/auth/youtube"
                className="inline-flex items-center gap-1.5 rounded-full border border-[#ff0000] bg-[#ff0000] px-3 py-1 text-xs font-medium text-white hover:opacity-90"
              >
                Connect YouTube
              </a>
            )}
          </div>
        }
        connectedProviders={[...connected]}
      />
    </div>
  );
}
