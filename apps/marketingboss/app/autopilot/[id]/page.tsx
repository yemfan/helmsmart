import { redirect } from "next/navigation";

/** Moved in the 2.0 IA — campaign detail lives under Playbooks. */
export default async function LegacyCampaignPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  redirect(`/playbooks/${id}`);
}
