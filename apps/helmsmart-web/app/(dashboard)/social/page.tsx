import { Metadata } from "next";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { SocialComposer } from "@/components/social-composer";
import { ResponsibleEmployee } from "@/components/responsible-employee";
import { EmilyDraftButton } from "@/components/emily-draft-button";

export const metadata: Metadata = { title: "Social" };

export default async function SocialPage({
  searchParams,
}: {
  searchParams: Promise<{ linkedin?: string; linkedin_error?: string }>;
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
    "id, platform, content, status, scheduled_at, published_at, published_url, generated_by_ai, ai_prompt, tone, created_at";
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

  const [{ data: posts }, { data: org }, { data: linkedinToken }] = await Promise.all([
    postsQuery(),
    supabase
      .from("organizations")
      .select("name")
      .eq("id", orgId)
      .single(),
    supabase
      .from("org_oauth_tokens")
      .select("connected_at")
      .eq("organization_id", orgId)
      .eq("provider", "linkedin")
      .maybeSingle(),
  ]);

  const linkedinConnected = !!linkedinToken;

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
          </div>
        }
      />
    </div>
  );
}
