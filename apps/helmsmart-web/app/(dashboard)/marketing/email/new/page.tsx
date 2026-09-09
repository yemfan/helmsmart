import type { Metadata } from "next";
import { EmailCampaignEditor } from "@/components/email-campaign-editor";
import { getServerT } from "@/lib/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getServerT("marketing");
  return { title: t("meta.newEmailCampaign") };
}

export default function NewEmailCampaignPage() {
  return <EmailCampaignEditor />;
}
