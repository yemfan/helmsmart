import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getEmailCampaign, getEmailCampaignRecipients } from "@/lib/actions/email-campaigns";
import { EmailCampaignEditor } from "@/components/email-campaign-editor";
import { EmailCampaignAnalytics } from "@/components/email-campaign-analytics";
import { getServerT } from "@/lib/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getServerT("marketing");
  return { title: t("meta.emailCampaign") };
}

export default async function EmailCampaignDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [campaign, recipients] = await Promise.all([
    getEmailCampaign(id),
    getEmailCampaignRecipients(id),
  ]);

  if (!campaign) notFound();

  if (campaign.status === "draft" || campaign.status === "scheduled" || campaign.status === "recurring") {
    return (
      <EmailCampaignEditor
        campaignId={id}
        initialValues={{
          name: campaign.name,
          subject: campaign.subject,
          previewText: campaign.preview_text ?? "",
          bodyHtml: campaign.body_html,
          fromName: campaign.from_name ?? "",
          replyTo: campaign.reply_to ?? "",
          targetSegment: campaign.target_segment,
          scheduledFor: campaign.scheduled_for ?? "",
        }}
        status={campaign.status}
      />
    );
  }

  return <EmailCampaignAnalytics campaign={campaign} recipients={recipients} />;
}
