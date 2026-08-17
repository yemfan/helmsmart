import { Suspense } from "react";
import { UploadOfferClient } from "./UploadOfferClient";
import { getServerT } from "@/lib/i18n/server";

export const metadata = {
  title: "Upload offer | CloseBoss",
  description:
    "Paste an offer document — CloseBoss extracts price, contingencies, and dates so you don't have to retype them.",
};

export default async function UploadOfferPage() {
  const t = await getServerT();
  return (
    <Suspense fallback={<div className="text-sm text-slate-500">Loading…</div>}>
      <UploadOfferClient />
    </Suspense>
  );
}
