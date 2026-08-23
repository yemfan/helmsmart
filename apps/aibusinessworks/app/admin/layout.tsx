import type { Metadata } from "next";
import type { ReactNode } from "react";
import { requireAdmin } from "@/lib/auth";

/** Administrative surfaces are per-request by definition and must never be prerendered. */
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: { default: "Admin", template: "%s | Admin" },
  robots: { index: false, follow: false },
};

export default async function AdminLayout({ children }: { children: ReactNode }) {
  // Every admin route is gated here, so an individual page cannot forget to.
  await requireAdmin();
  return children;
}
