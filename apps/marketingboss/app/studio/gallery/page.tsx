import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import Nav from "@/components/Nav";
import GalleryGrid from "@/components/GalleryGrid";

type Generation = {
  id: string;
  type: "image" | "video";
  prompt: string;
  aspect: string | null;
  media_url: string;
  created_at: string;
};

/** The Studio's asset library — every render, saved. */
export default async function GalleryPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [{ data }, { data: profile }] = await Promise.all([
    supabase
      .from("generations")
      .select("id, type, prompt, aspect, media_url, created_at")
      .order("created_at", { ascending: false })
      .limit(60),
    supabase.from("profiles").select("credits").eq("user_id", user.id).single(),
  ]);

  const items = (data ?? []) as Generation[];

  return (
    <main className="mx-auto flex min-h-dvh max-w-5xl flex-col gap-8 px-5 py-8 sm:py-12">
      <Nav email={user.email ?? ""} credits={profile?.credits ?? 0} />

      <div>
        <Link href="/studio" className="text-xs text-slate-500 transition hover:text-slate-900">
          ← Studio
        </Link>
        <h2 className="text-xl font-bold tracking-tight">Your gallery</h2>
        <p className="text-sm text-slate-500">{items.length} saved generation{items.length === 1 ? "" : "s"}</p>
      </div>

      {items.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-10 text-center text-sm text-slate-500">
          Nothing here yet. Head to the{" "}
          <a href="/studio" className="font-medium text-boss-gold hover:underline">
            Studio
          </a>{" "}
          and generate something.
        </div>
      ) : (
        <GalleryGrid items={items} />
      )}
    </main>
  );
}
