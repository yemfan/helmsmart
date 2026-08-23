import { notFound } from "next/navigation";
import { supabaseServer } from "@/lib/supabaseServer";
import PresentationPublicClient from "@/app/presentation/PresentationPublicClient";
import type { Metadata } from "next";
import { getServerT } from "@/lib/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getServerT();
  const title = t("routeMeta.listingPresentation.title", { ns: "web_marketing" });
  const description = t("routeMeta.listingPresentation.description", { ns: "web_marketing" });
  return {
  title,
  description,
  keywords: ["presentation", "listing", "seller"],
  robots: { index: false },
};
}

type PresentationRow = {
  id: string;
  agent_id: string;
  property_address: string;
  data: any;
  created_at: string;
};

export default async function PresentationPublicPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const t = await getServerT();
  const { id } = await params;
  const { data, error } = await supabaseServer
    .from("presentations")
    .select("id,agent_id,property_address,data,created_at")
    .eq("id", id)
    .maybeSingle();

  if (error) {
    console.error("presentation/public load error", error);
    return notFound();
  }

  if (!data) return notFound();

  const row = data as PresentationRow;

  return (
    <PresentationPublicClient
      presentationId={row.id}
      data={row.data as any}
      propertyAddress={row.property_address}
    />
  );
}

