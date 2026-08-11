import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import Nav from "@/components/Nav";
import CommunityLibrary from "@/components/CommunityLibrary";
import { listCommunities } from "@/lib/communityIntelligence";
import { getBusinessProfile } from "@/lib/businessProfile";
import { aiConfigured } from "@/lib/ai";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** 🌐 Community Intelligence — where should this business publish, and how? */
export default async function CommunitiesPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [{ data: profile }, communities, business] = await Promise.all([
    supabase.from("profiles").select("credits").eq("user_id", user.id).single(),
    listCommunities(user.id).catch(() => []),
    getBusinessProfile(user.id).catch(() => null),
  ]);

  return (
    <main className="mx-auto flex min-h-dvh max-w-5xl flex-col gap-8 px-5 py-8 sm:py-12">
      <Nav email={user.email ?? ""} credits={profile?.credits ?? 0} />
      <section className="flex flex-col gap-1">
        <Link href="/studio" className="text-xs text-slate-500 transition hover:text-slate-900">
          ← Studio
        </Link>
        <h2 className="text-2xl font-bold tracking-tight">🌐 Community Intelligence</h2>
        <p className="text-sm text-slate-500">
          Where your audience actually gathers — each community with its culture, rules, and an honest read on how
          promotable it is. Not a directory: a shortlist worth your time.
        </p>
      </section>
      <CommunityLibrary
        initial={communities}
        businessName={business?.name ?? null}
        hasBusiness={Boolean(business?.summary)}
        aiConfigured={aiConfigured()}
      />
      <footer className="mt-auto pt-6 text-center text-[11px] text-slate-400">
        Community facts are research estimates with sources · posting into communities stays in your hands — we write
        it, you post it
      </footer>
    </main>
  );
}
