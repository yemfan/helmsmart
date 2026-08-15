import { redirect } from "next/navigation";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Account Billing",
  description: "Manage your subscription and billing settings.",
  keywords: ["billing", "subscription", "account"],
  robots: { index: false },
};

/**
 * Canonical billing UI lives at /dashboard/credits — CloseBoss moved to
 * usage-based pricing. Points straight there rather than bouncing through
 * /dashboard/billing, which is itself only a redirect to the same place.
 */
export default function AccountBillingPage() {
  redirect("/dashboard/credits");
}
