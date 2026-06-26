import { Suspense } from "react";
import { UploadOfferClient } from "./UploadOfferClient";

export const metadata = {
  title: "Upload offer | RealtyBoss",
  description:
    "Paste an offer document — RealtyBoss extracts price, contingencies, and dates so you don't have to retype them.",
};

export default function UploadOfferPage() {
  return (
    <Suspense fallback={<div className="text-sm text-slate-500">Loading…</div>}>
      <UploadOfferClient />
    </Suspense>
  );
}
