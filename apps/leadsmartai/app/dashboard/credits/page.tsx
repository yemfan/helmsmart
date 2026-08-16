import type { Metadata } from "next";
import { Suspense } from "react";
import CreditsClient from "./CreditsClient";
import { getServerT } from "@/lib/i18n/server";

export const metadata: Metadata = {
  title: "Credits",
  description: "Buy credits and manage your usage plan.",
  robots: { index: false },
};

export default async function CreditsPage() {
  const t = await getServerT();
  return (
    <Suspense fallback={<div className="p-4 text-sm text-gray-600">Loading credits…</div>}>
      <CreditsClient />
    </Suspense>
  );
}
