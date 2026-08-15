import ScanCardClient from "./ScanCardClient";
import { getServerT } from "@/lib/i18n/server";

import type { Metadata } from "next";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getServerT();
  return {
    title: `${t("pages.scanCard.metaTitle", { ns: "dashboard" })} | CloseBoss`,
    description: t("pages.scanCard.metaDescription", { ns: "dashboard" }),
  };
}

export default function ScanCardPage() {
  return (
    <div className="mx-auto max-w-lg px-4 py-6">
      <ScanCardClient />
    </div>
  );
}
