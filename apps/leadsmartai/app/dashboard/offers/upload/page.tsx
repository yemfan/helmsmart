import type { Metadata } from "next";
import { Suspense } from "react";
import { UploadOfferClient } from "./UploadOfferClient";
import { getServerT } from "@/lib/i18n/server";
import { LoadingText } from "@/components/ui/LoadingText";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getServerT();
  const title = t("pages.dashboardTitles.uploadOffer", { ns: "dashboard" });
  return {
  title,
  description:
    "Paste an offer document — CloseBoss extracts price, contingencies, and dates so you don't have to retype them.",
};
}

export default async function UploadOfferPage() {
  const t = await getServerT();
  return (
    <Suspense fallback={<div className="text-sm text-slate-500"><LoadingText /></div>}>
      <UploadOfferClient />
    </Suspense>
  );
}
