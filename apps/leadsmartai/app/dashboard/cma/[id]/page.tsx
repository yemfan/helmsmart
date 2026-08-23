import type { Metadata } from "next";

import CmaDetailClient from "./CmaDetailClient";
import { getServerT } from "@/lib/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getServerT();
  const title = t("pages.dashboardTitles.cmaReport", { ns: "dashboard" });
  return {
  title,
};
}

export default async function CmaDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const t = await getServerT();
  const { id } = await params;
  return (
    <main className="mx-auto max-w-5xl px-4 py-8">
      <CmaDetailClient cmaId={id} />
    </main>
  );
}
