import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import Nav from "@/components/Nav";

type Generation = {
  id: string;
  type: "image" | "video";
  prompt: string;
  aspect: string | null;
  media_url: string;
  created_at: string;
};

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
        <h2 className="text-xl font-bold tracking-tight">Your gallery</h2>
        <p className="text-sm text-white/45">{items.length} saved generation{items.length === 1 ? "" : "s"}</p>
      </div>

      {items.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-white/15 bg-white/[0.02] p-10 text-center text-sm text-white/50">
          Nothing here yet. Head to the{" "}
          <a href="/" className="font-medium text-boss-gold hover:underline">
            Studio
          </a>{" "}
          and generate something.
        </div>
      ) : (
        <section className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {items.map((g) => (
            <figure
              key={g.id}
              className="group overflow-hidden rounded-xl border border-white/10 bg-black/40"
              title={g.prompt}
            >
              {g.type === "video" ? (
                <video src={g.media_url} muted loop playsInline className="aspect-video w-full object-cover" />
              ) : (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={g.media_url} alt={g.prompt} className="aspect-video w-full object-cover" />
              )}
              <figcaption className="flex items-center justify-between gap-2 px-2.5 py-1.5 text-[11px] text-white/45">
                <span className="capitalize">{g.type}</span>
                <a
                  href={g.media_url}
                  download
                  target="_blank"
                  rel="noreferrer"
                  className="font-medium text-boss-gold opacity-0 transition group-hover:opacity-100"
                >
                  ↓
                </a>
              </figcaption>
            </figure>
          ))}
        </section>
      )}
    </main>
  );
}
