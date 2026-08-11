import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import Nav from "@/components/Nav";
import CharacterStudio from "@/components/CharacterStudio";
import { listCharacters } from "@/lib/characters";
import { aiConfigured } from "@/lib/ai";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** 🎭 Character Studio — a persistent cast for the business. */
export default async function CharacterStudioPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [{ data: profile }, characters] = await Promise.all([
    supabase.from("profiles").select("credits").eq("user_id", user.id).single(),
    listCharacters(user.id).catch(() => []),
  ]);

  return (
    <main className="mx-auto flex min-h-dvh max-w-5xl flex-col gap-8 px-5 py-8 sm:py-12">
      <Nav email={user.email ?? ""} credits={profile?.credits ?? 0} />
      <section className="flex flex-col gap-1">
        <Link href="/studio" className="text-xs text-slate-500 transition hover:text-slate-900">
          ← Studio
        </Link>
        <h2 className="text-2xl font-bold tracking-tight">🎭 Character Studio</h2>
        <p className="text-sm text-slate-500">
          Create characters your audience remembers — a persistent cast that presents your content consistently, from
          the trending-format remixes to every video and image the studio makes.
        </p>
      </section>
      <CharacterStudio initial={characters} aiConfigured={aiConfigured()} />
      <footer className="mt-auto pt-6 text-center text-[11px] text-slate-400">
        Portraits cost 1 credit · characters are fictional unless you record consent for a real likeness
      </footer>
    </main>
  );
}
