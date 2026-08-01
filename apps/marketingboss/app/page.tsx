import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import Nav from "@/components/Nav";
import Studio from "@/components/Studio";

export default async function Home() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("credits")
    .eq("user_id", user.id)
    .single();
  const credits = profile?.credits ?? 0;

  return (
    <main className="mx-auto flex min-h-dvh max-w-3xl flex-col gap-8 px-5 py-8 sm:py-12">
      <Nav email={user.email ?? ""} credits={credits} />
      <Studio />
      <footer className="mt-auto pt-6 text-center text-[11px] text-white/25">
        Powered by fal.ai · image 1 credit · edit 2 · video 20 · every render is saved to your gallery
      </footer>
    </main>
  );
}
