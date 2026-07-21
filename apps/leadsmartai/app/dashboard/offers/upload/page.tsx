import { Suspense } from "react";
import { UploadOfferClient } from "./UploadOfferClient";

export const metadata = {
  title: "Upload offer | CloseBoss",
  description:
    "Paste an offer document — CloseBoss extracts price, contingencies, and dates so you don't have to retype them.",
};

export default function UploadOfferPage() {
  return (
    <Suspense fallback={<div className="text-sm text-slate-500">Loading…</div>}>
      <UploadOfferClient />
    </Suspense>
  );
}
