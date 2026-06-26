import type { Metadata } from "next";

import CmaDetailClient from "./CmaDetailClient";

export const metadata: Metadata = {
  title: "CMA Report | RealtyBoss",
};

export default async function CmaDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <main className="mx-auto max-w-5xl px-4 py-8">
      <CmaDetailClient cmaId={id} />
    </main>
  );
}
