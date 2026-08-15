import type { Metadata } from "next";
import { getServerT } from "@/lib/i18n/server";
import { notFound } from "next/navigation";
import { getCurrentAgentContext } from "@/lib/dashboardService";
import { getContact } from "@/lib/contacts/service";
import { listTemplatesForAgent } from "@/lib/templates/service";
import SphereContactProfile from "@/components/dashboard/SphereContactProfile";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getServerT();
  return {
    title: t("pages.sphereContact.metaTitle", { ns: "dashboard" }),
    robots: { index: false },
  };
}

export default async function SphereContactPage({
  params,
}: {
  params: Promise<{ contactId: string }>;
}) {
  const { contactId } = await params;
  const { agentId } = await getCurrentAgentContext();
  const [contact, templates] = await Promise.all([
    getContact(agentId, contactId),
    listTemplatesForAgent(agentId),
  ]);
  if (!contact) notFound();
  return <SphereContactProfile contact={contact} templates={templates} />;
}
