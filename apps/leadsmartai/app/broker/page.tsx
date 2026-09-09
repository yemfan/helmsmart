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
      title={t("pages.brokerPortal.title", { ns: "web_pages" })}
      description={t("pages.brokerPortal.description", { ns: "web_pages" })}
      links={[
        { href: "/dashboard/broker", label: t("pages.brokerPortal.brokerDashboard", { ns: "web_pages" }), description: t("pages.brokerPortal.brokerDashboardDesc", { ns: "web_pages" }) },
        { href: "/dashboard/growth", label: t("pages.brokerPortal.growthSeo", { ns: "web_pages" }), description: t("pages.brokerPortal.growthSeoDesc", { ns: "web_pages" }) },
        { href: "/dashboard/leads", label: t("pages.brokerPortal.leadsCrm", { ns: "web_pages" }), description: t("pages.brokerPortal.leadsCrmDesc", { ns: "web_pages" }) },
        { href: "/dashboard/marketing", label: t("pages.brokerPortal.marketing", { ns: "web_pages" }), description: t("pages.brokerPortal.marketingDesc", { ns: "web_pages" }) },
        { href: "/agent/pricing", label: t("pages.brokerPortal.plansBilling", { ns: "web_pages" }), description: t("pages.brokerPortal.plansBillingDesc", { ns: "web_pages" }) },
        { href: "/portal", label: t("pages.brokerPortal.stripePortal", { ns: "web_pages" }), description: t("pages.brokerPortal.stripePortalDesc", { ns: "web_pages" }) },
      ]}
    />
  );
}
