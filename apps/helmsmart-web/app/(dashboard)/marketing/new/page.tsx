import type { Metadata } from "next";
import Link from "next/link";
import { cookies } from "next/headers";
import { ArrowLeft } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getServerT } from "@/lib/i18n/server";
import { CampaignForm } from "./campaign-form";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getServerT("marketing");
  return { title: t("meta.newCampaign") };
}

export default async function NewCampaignPage() {
  const cookieStore = await cookies();
  const orgId = cookieStore.get("helmsmart-org-id")?.value ?? "";
  const supabase = await createClient();
  const t = await getServerT("marketing");
  const { data: rows } = await supabase
    .from("clients")
    .select("tags")
    .eq("organization_id", orgId);
  const tagSet = new Set<string>();
  for (const r of rows ?? []) {
    for (const tag of ((r.tags as string[] | null) ?? [])) tagSet.add(tag);
  }
  const availableTags = Array.from(tagSet).sort();

  return (
    <div className="p-8 max-w-3xl mx-auto">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">
            {t("campaigns.new.title")}
          </h1>
          <p className="text-sm text-slate-500 mt-0.5">
            {t("campaigns.new.subtitle")}
          </p>
        </div>
        <Link
          href="/marketing"
          className="flex items-center gap-1.5 text-sm text-slate-600 hover:text-slate-900 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          {t("campaigns.new.back")}
        </Link>
      </div>

      <CampaignForm availableTags={availableTags} />
    </div>
  );
}
