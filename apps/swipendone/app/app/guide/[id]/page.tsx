import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getGuideForEdit, getGuideAnalytics } from "@/lib/dashboard-data";
import { appUrl } from "@/lib/env";
import { GuideEditor } from "@/components/guide-editor";

export const dynamic = "force-dynamic";

export default async function EditGuidePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const data = await getGuideForEdit(id);
  if (!data) notFound();

  const analytics = await getGuideAnalytics(id);

  let brandName = "";
  const db = await createClient();
  if (db) {
    const {
      data: { user },
    } = await db.auth.getUser();
    if (user) {
      const { data: seller } = await db.from("sellers").select("brand_name").eq("id", user.id).maybeSingle();
      brandName = seller?.brand_name ?? "";
    }
  }

  return (
    <GuideEditor
      guideId={id}
      data={data}
      analytics={analytics}
      brandName={brandName}
      appUrl={appUrl()}
    />
  );
}
