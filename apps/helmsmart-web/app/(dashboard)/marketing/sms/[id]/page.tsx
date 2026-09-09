import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { SMSCampaignEditor } from "@/components/sms-campaign-editor";
import { SMSCampaignAnalytics } from "@/components/sms-campaign-analytics";
import { getServerT } from "@/lib/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getServerT("marketing");
  return { title: t("meta.smsCampaign") };
}

export default async function SMSCampaignDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const cookieStore = await cookies();
  const orgId = cookieStore.get("helmsmart-org-id")?.value ?? "";
  const supabase = await createClient();

  const [campaignRes, recipientsRes] = await Promise.all([
    supabase
      .from("sms_campaigns")
      .select("*")
      .eq("id", id)
      .eq("organization_id", orgId)
      .single(),
    supabase
      .from("sms_campaign_recipients")
      .select(
        "id, recipient_name, recipient_email, phone_number, sent_at, delivered_at, failed_at, failure_reason, unsubscribed_at"
      )
      .eq("campaign_id", id)
      .order("sent_at", { ascending: false })
      .limit(200),
  ]);

  if (!campaignRes.data) notFound();

  const campaign = campaignRes.data;
  const recipients = recipientsRes.data ?? [];

  // For draft/scheduled campaigns show the editor; for sent/sending show analytics
  if (campaign.status === "draft" || campaign.status === "scheduled") {
    return (
      <SMSCampaignEditor
        campaignId={id}
        initialValues={{
          name: campaign.name,
          description: campaign.description ?? "",
          messageText: campaign.message_text,
          targetSegment: campaign.target_segment,
          scheduledFor: campaign.scheduled_for ?? "",
        }}
        status={campaign.status}
      />
    );
  }

  return (
    <SMSCampaignAnalytics
      campaign={campaign}
      recipients={recipients}
    />
  );
}
