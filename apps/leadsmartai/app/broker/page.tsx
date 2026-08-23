import RolePortalHub from "@/components/portals/RolePortalHub";
import type { Metadata } from "next";
import { getServerT } from "@/lib/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getServerT();
  const title = t("routeMeta.broker.title", { ns: "web_marketing" });
  const description = t("routeMeta.broker.description", { ns: "web_marketing" });
  return {
  title,
  description,
  keywords: ["broker portal", "brokerage", "pipeline"],
  robots: { index: false },
};
}

export default async function BrokerPortalPage() {
  const t = await getServerT();
  return (
    <RolePortalHub
      eyebrow="CloseBoss"
      title={t("pages.brokerPortal.title", { ns: "dashboard" })}
      description={t("pages.brokerPortal.description", { ns: "dashboard" })}
      links={[
        { href: "/dashboard/broker", label: t("pages.brokerPortal.brokerDashboard", { ns: "dashboard" }), description: t("pages.brokerPortal.brokerDashboardDesc", { ns: "dashboard" }) },
        { href: "/dashboard/growth", label: t("pages.brokerPortal.growthSeo", { ns: "dashboard" }), description: t("pages.brokerPortal.growthSeoDesc", { ns: "dashboard" }) },
        { href: "/dashboard/leads", label: t("pages.brokerPortal.leadsCrm", { ns: "dashboard" }), description: t("pages.brokerPortal.leadsCrmDesc", { ns: "dashboard" }) },
        { href: "/dashboard/marketing", label: t("pages.brokerPortal.marketing", { ns: "dashboard" }), description: t("pages.brokerPortal.marketingDesc", { ns: "dashboard" }) },
        { href: "/agent/pricing", label: t("pages.brokerPortal.plansBilling", { ns: "dashboard" }), description: t("pages.brokerPortal.plansBillingDesc", { ns: "dashboard" }) },
        { href: "/portal", label: t("pages.brokerPortal.stripePortal", { ns: "dashboard" }), description: t("pages.brokerPortal.stripePortalDesc", { ns: "dashboard" }) },
      ]}
    />
  );
}
