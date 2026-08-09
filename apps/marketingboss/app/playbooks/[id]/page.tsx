import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import Nav from "@/components/Nav";
import CampaignDetail from "@/components/CampaignDetail";
import { getCampaign, listPosts } from "@/lib/campaigns";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default async function PlaybookPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const campaign = await getCampaign(user.id, id);
  if (!campaign) notFound();

  const [{ data: profile }, posts] = await Promise.all([
    supabase.from("profiles").select("credits").eq("user_id", user.id).single(),
    listPosts(user.id, id),
  ]);

  return (
    <main className="mx-auto flex min-h-dvh max-w-3xl flex-col gap-8 px-5 py-8 sm:py-12">
      <Nav email={user.email ?? ""} credits={profile?.credits ?? 0} />
      <CampaignDetail campaign={campaign} posts={posts} />
    </main>
  );
}
