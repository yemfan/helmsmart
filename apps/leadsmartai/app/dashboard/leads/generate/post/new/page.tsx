import type { Metadata } from "next";

import QuickPostClient from "./QuickPostClient";

export const metadata: Metadata = {
  title: "Quick Post | RealtyBoss",
  description: "Draft an AI-written social post about a listing or open house.",
  robots: { index: false },
};

export default function QuickPostPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-6">
      <QuickPostClient />
    </div>
  );
}
