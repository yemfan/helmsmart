import type { Metadata } from "next";
import type { ReactNode } from "react";

/** Partner surfaces are per-request by definition and must never be prerendered. */
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: { default: "Partner Dashboard", template: "%s | Partner Dashboard" },
  robots: { index: false, follow: false },
};

export default function DashboardLayout({ children }: { children: ReactNode }) {
  return children;
}
