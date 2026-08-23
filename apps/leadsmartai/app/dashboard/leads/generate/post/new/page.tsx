import type { Metadata } from "next";

import QuickPostClient from "./QuickPostClient";
import { getServerT } from "@/lib/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getServerT();
  const title = t("pages.dashboardTitles.quickPost", { ns: "dashboard" });
  return {
  title,
  description: "Draft an AI-written social post about a listing or open house.",
  robots: { index: false },
};
}

export default async function QuickPostPage() {
  const t = await getServerT();
  return (
    <div className="mx-auto max-w-3xl px-4 py-6">
      <QuickPostClient />
    </div>
  );
}
