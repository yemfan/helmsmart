import { getServerT } from "@/lib/i18n/server";
import { Suspense } from "react";
import { UploadListingClient } from "./UploadListingClient";

import type { Metadata } from "next";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getServerT();
  return { title: `${t("pages.uploadListing.metaTitle", { ns: "dashboard" })} | CloseBoss` };
}

export default function UploadListingPage() {
  return (
    <Suspense fallback={<div className="text-sm text-slate-500">Loading…</div>}>
      <UploadListingClient />
    </Suspense>
  );
}
