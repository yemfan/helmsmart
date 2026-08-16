import type { Metadata } from "next";

import QuickPostClient from "./QuickPostClient";
import { getServerT } from "@/lib/i18n/server";

export const metadata: Metadata = {
  title: "Quick Post | CloseBoss",
  description: "Draft an AI-written social post about a listing or open house.",
  robots: { index: false },
};

export default async function QuickPostPage() {
  const t = await getServerT();
  return (
    <div className="mx-auto max-w-3xl px-4 py-6">
      <QuickPostClient />
    </div>
  );
}
