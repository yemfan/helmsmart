import { ImportWizardClient } from "./ImportWizardClient";
import type { Metadata } from "next";
import { getServerT } from "@/lib/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getServerT();
  return {
    title: t("pages.importWizard.metaTitle", { ns: "dashboard" }),
    description: t("pages.importWizard.metaDescription", { ns: "dashboard" }),
    keywords: ["import leads", "CSV import", "bulk upload"],
    robots: { index: false },
  };
}

export default function LeadImportPage() {
  return <ImportWizardClient />;
}
