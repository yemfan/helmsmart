import RolePortalHub from "@/components/portals/RolePortalHub";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Agent Portal",
  description: "Your command center for leads, CMAs, and AI tools.",
  keywords: ["agent portal", "leads", "CMA", "AI tools"],
  robots: { index: false },
};

export default function AgentPortalPage() {
  return (
    <RolePortalHub
      eyebrow="RealtyBoss"
      title="Agent portal"
      description="Your command center for leads, CMAs, and AI tools — jump into any workflow below."
      links={[
        { href: "/dashboard/overview", label: "Dashboard overview", description: "Today’s pipeline snapshot" },
        { href: "/dashboard/leads", label: "Leads", description: "CRM and follow-ups" },
        { href: "/smart-cma-builder", label: "Smart CMA builder", description: "Comparable analysis" },
        { href: "/dashboard/tools", label: "Tools", description: "Calculators and generators" },
        { href: "/agent/pricing", label: "Plans & billing", description: "Upgrade when you’re ready" },
        { href: "/portal", label: "Stripe billing portal", description: "Manage subscription in Stripe" },
      ]}
    />
  );
}
