import type { Metadata } from "next";

import CmaDetailClient from "./CmaDetailClient";
import { getServerT } from "@/lib/i18n/server";

export const metadata: Metadata = {
  title: "CMA Report",
};

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
