import RolePortalHub from "@/components/portals/RolePortalHub";
import type { Metadata } from "next";
import { getServerT } from "@/lib/i18n/server";

export const metadata: Metadata = {
  title: "Admin Portal",
  description: "Platform administration and operational tools.",
  keywords: ["admin", "platform", "operations"],
  robots: { index: false },
};

export default async function AdminPortalPage() {
  const t = await getServerT();
  return (
    <RolePortalHub
      eyebrow="LeadSmart AI"
      title={t("pages.adminPages.portal", { ns: "dashboard" })}
      description="Platform administration and operational tools. Open the full dashboard for day-to-day work."
      links={[
        { href: "/admin/platform-overview", label: "Platform overview", description: "Cross-product KPIs, funnel, and ops" },
        { href: "/admin/signups", label: "Signups by source", description: "Where new agent signups come from" },
        { href: "/admin/founder", label: "Founder analytics", description: "MRR, funnel, churn, and usage events" },
        { href: "/admin/billing", label: "Subscription & billing", description: "Plans, MRR, and subscription status" },
        { href: "/admin/support", label: "Support inbox", description: "Customer conversations and replies" },
        { href: "/admin/jobs", label: "Cron job monitor", description: "View schedules, trigger jobs manually, inspect results" },
        { href: "/dashboard/overview", label: "Operations dashboard", description: "Overview, leads, and tools" },
        { href: "/dashboard/settings", label: "Account & settings", description: "Profile and preferences" },
        { href: "/portal", label: "Stripe billing portal", description: "Invoices and payment method" },
      ]}
    />
  );
}
