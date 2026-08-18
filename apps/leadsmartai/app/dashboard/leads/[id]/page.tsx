import type { Metadata } from "next";
import LeadProfileClient from "./LeadProfileClient";

export const metadata: Metadata = {
  title: "Lead Profile",
  description: "The person, their story, your AI team's work with them, and the next best action.",
  robots: { index: false },
};

/**
 * Person-first lead profile (constitution: present leads as people,
 * not database records). Full-page sibling of the LeadProfileDrawer —
 * both are fed by /api/dashboard/closeboss/lead/[id]. The classic
 * contacts hub remains untouched at /dashboard/contacts.
 */
export default async function LeadProfilePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <LeadProfileClient leadId={id} />;
}
