import RolePortalHub from "@/components/portals/RolePortalHub";
import type { Metadata } from "next";
import { getServerT } from "@/lib/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getServerT();
  const ta = (key: string): string => t(key, { ns: "web_agent" });
  return {
    title: ta("meta.title"),
    description: ta("meta.description"),
    keywords: ["agent portal", "leads", "CMA", "AI tools"],
    robots: { index: false },
  };
}

export default async function AgentPortalPage() {
  const t = await getServerT();
  const ta = (key: string): string => t(key, { ns: "web_agent" });
  return (
    <RolePortalHub
      eyebrow={ta("hub.eyebrow")}
      title={ta("hub.title")}
      description={ta("hub.description")}
      links={[
        { href: "/dashboard/overview", label: ta("links.dashboard.label"), description: ta("links.dashboard.description") },
        { href: "/dashboard/leads", label: ta("links.leads.label"), description: ta("links.leads.description") },
        { href: "/smart-cma-builder", label: ta("links.cma.label"), description: ta("links.cma.description") },
        { href: "/dashboard/tools", label: ta("links.tools.label"), description: ta("links.tools.description") },
        { href: "/agent/pricing", label: ta("links.pricing.label"), description: ta("links.pricing.description") },
        { href: "/portal", label: ta("links.portal.label"), description: ta("links.portal.description") },
      ]}
    />
  );
}
