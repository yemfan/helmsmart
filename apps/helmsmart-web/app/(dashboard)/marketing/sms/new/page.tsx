import type { Metadata } from "next";
import { SMSCampaignEditor } from "@/components/sms-campaign-editor";
import { getServerT } from "@/lib/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getServerT("marketing");
  return { title: t("meta.newSmsCampaign") };
}

export default function NewSMSCampaignPage() {
  return <SMSCampaignEditor />;
}
