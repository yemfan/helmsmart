import RolePortalHub from "@/components/portals/RolePortalHub";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Broker Portal",
  description: "Lead your brokerage with pipeline visibility and growth tools.",
  keywords: ["broker portal", "brokerage", "pipeline"],
  robots: { index: false },
};

export default function BrokerPortalPage() {
  return (
    <RolePortalHub
      eyebrow="RealtyBoss"
      title="Broker portal"
      description="Lead your brokerage with pipeline visibility, growth tools, and team-ready workflows."
      links={[
        { href: "/dashboard/broker", label: "Broker dashboard", description: "Brokerage home, pipeline & growth" },
        { href: "/dashboard/growth", label: "Growth & SEO", description: "Traffic and landing tools" },
        { href: "/dashboard/leads", label: "Leads & CRM", description: "Pipeline and follow-ups" },
        { href: "/dashboard/marketing", label: "Marketing", description: "Campaigns and assets" },
        { href: "/loan-broker/pricing", label: "Plans & billing", description: "Team plans and upgrades" },
        { href: "/portal", label: "Stripe billing portal", description: "Billing and invoices" },
      ]}
    />
  );
}
