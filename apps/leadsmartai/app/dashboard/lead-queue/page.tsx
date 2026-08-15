import { LeadQueueClient } from "./LeadQueueClient";
import { getServerT } from "@/lib/i18n/server";

import type { Metadata } from "next";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getServerT();
  return {
    title: `${t("pages.leadQueue.metaTitle", { ns: "dashboard" })} | CloseBoss`,
    description: t("pages.leadQueue.metaDescription", { ns: "dashboard" }),
  };
}

export default function LeadQueuePage() {
  return (
    <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6">
      <LeadQueueClient />
    </div>
  );
}
