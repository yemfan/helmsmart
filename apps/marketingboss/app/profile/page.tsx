import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import Nav from "@/components/Nav";
import DigitalTwinPanel from "@/components/DigitalTwinPanel";
import { getTwin } from "@/lib/digitalTwin";
import { voiceCloningConfigured } from "@/lib/voiceClone";
import { BRAND_KIT_COLUMNS, type BrandKit } from "@/lib/brandKit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Profile — your identical twin.
 *
 * Deliberately its own page rather than a fourth Settings tab. Settings is
 * where you configure the product; this is who the product speaks as. It pulls
 * the Brand Kit in read-only alongside the twin because the two are only useful
 * together — the twin is the face and voice, the brand kit is what they say —
 * but editing the brand kit still happens in one place, in Settings.
 */
export default async function ProfilePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [{ data: profile }, { data: brand }, twin] = await Promise.all([
    supabase.from("profiles").select("credits").eq("user_id", user.id).single(),
    supabase.from("brand_kits").select(BRAND_KIT_COLUMNS).eq("user_id", user.id).maybeSingle(),
    // A database without migration 0029 reads as "no twin" rather than a crash.
    getTwin(supabase, user.id).catch(() => null),
  ]);

  return (
    <main className="mx-auto flex min-h-dvh max-w-3xl flex-col gap-8 px-5 py-8 sm:py-12">
      <Nav email={user.email ?? ""} credits={profile?.credits ?? 0} />
      <section className="flex flex-col gap-1">
        <h2 className="text-2xl font-bold tracking-tight">Your profile</h2>
        <p className="text-sm text-slate-500">
          Your identical twin — the face and voice your marketing goes out with.
        </p>
      </section>
      <DigitalTwinPanel
        email={user.email ?? ""}
        initialTwin={twin}
        brand={(brand ?? null) as BrandKit | null}
        voiceCloning={voiceCloningConfigured()}
      />
    </main>
  );
}
