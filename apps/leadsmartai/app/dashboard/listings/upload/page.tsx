import { Suspense } from "react";
import { UploadListingClient } from "./UploadListingClient";

export const metadata = {
  title: "Upload listing agreement | RealtyBoss",
  description:
    "Drop in a signed RLA — RealtyBoss extracts list price, listing dates, sellers, and commission so you don't have to retype them.",
};

export default function UploadListingPage() {
  return (
    <Suspense fallback={<div className="text-sm text-slate-500">Loading…</div>}>
      <UploadListingClient />
    </Suspense>
  );
}
