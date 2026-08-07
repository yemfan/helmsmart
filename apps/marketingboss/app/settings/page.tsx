import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import Nav from "@/components/Nav";
import SettingsTabs from "@/components/SettingsTabs";
import { getConnectionStatuses } from "@/lib/social";
import { youtubeConfigured } from "@/lib/youtube";
import { OAUTH_ADAPTERS } from "@/lib/oauth";
import { CREDIT_PACKS } from "@/lib/billing";
import { stripeConfigured } from "@/lib/stripe";
import { BRAND_KIT_COLUMNS, type BrandKit } from "@/lib/brandKit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PLATFORMS = ["youtube", "facebook", "instagram", "threads", "linkedin", "pinterest", "tiktok"];

/**
 * Settings — the single home for every MarketingBoss configuration
 * (Connections + Billing & credits), reached from the top-nav Settings link.
 * Old /connections and /billing routes redirect here.
 */
export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; status?: string }>;
}) {
  const sp = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [{ data: profile }, statuses, { data: brand }] = await Promise.all([
    supabase.from("profiles").select("credits").eq("user_id", user.id).single(),
    getConnectionStatuses(user.id, PLATFORMS),
    supabase.from("brand_kits").select(BRAND_KIT_COLUMNS).eq("user_id", user.id).maybeSingle(),
  ]);

  const providersConfigured: Record<string, boolean> = {
    meta: OAUTH_ADAPTERS.meta.configured(),
    linkedin: OAUTH_ADAPTERS.linkedin.configured(),
    threads: OAUTH_ADAPTERS.threads.configured(),
    pinterest: OAUTH_ADAPTERS.pinterest.configured(),
    tiktok: OAUTH_ADAPTERS.tiktok.configured(),
    youtube: youtubeConfigured(),
  };

  const initialTab = sp.tab === "billing" ? "billing" : sp.tab === "connections" ? "connections" : "brand";

  return (
    <main className="mx-auto flex min-h-dvh max-w-3xl flex-col gap-8 px-5 py-8 sm:py-12">
      <Nav email={user.email ?? ""} credits={profile?.credits ?? 0} />
      <section className="flex flex-col gap-1">
        <h2 className="text-2xl font-bold tracking-tight">Settings</h2>
        <p className="text-sm text-slate-500">Manage your connections and billing.</p>
      </section>
      <SettingsTabs
        initialTab={initialTab}
        stripeStatus={sp.status ?? null}
        uid={user.id}
        brand={(brand ?? null) as BrandKit | null}
        connections={{ providersConfigured, statuses }}
        billing={{ packs: CREDIT_PACKS, configured: stripeConfigured() }}
      />
    </main>
  );
}
