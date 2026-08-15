import type { Metadata } from "next";
import { getServerT } from "@/lib/i18n/server";
import SphereImportClient from "@/components/dashboard/SphereImportClient";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getServerT();
  return {
    title: t("pages.sphereImport.metaTitle", { ns: "dashboard" }),
    robots: { index: false },
  };
}

export default function SphereImportPage() {
  return (
    <div className="mx-auto max-w-6xl">
      <SphereImportClient />
    </div>
  );
}
