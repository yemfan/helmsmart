import twilio from "twilio";

export type NotifyAssignedAgentChatSmsParams = {
  toPhoneE164: string;
  agentDisplayName: string;
  customerName: string;
  conversationPublicId: string;
};

/**
 * SMS the agent a deep link to the CloseBoss support inbox (opens conversation by public id when UI supports it).
 */
export async function notifyAssignedAgentChatSms(
  params: NotifyAssignedAgentChatSmsParams
): Promise<{ sent: boolean; reason?: string }> {
  const sid = process.env.TWILIO_ACCOUNT_SID?.trim();
  const token = process.env.TWILIO_AUTH_TOKEN?.trim();
  const from = process.env.TWILIO_FROM_NUMBER?.trim();
  const closebossBase =
    process.env.NEXT_PUBLIC_CLOSEBOSS_URL?.trim().replace(/\/$/, "") ||
    process.env.NEXT_PUBLIC_LEADSMART_URL?.trim().replace(/\/$/, "") ||
    process.env.LEADSMART_APP_URL?.trim().replace(/\/$/, "");

  if (!sid || !token || !from) {
    return { sent: false, reason: "twilio_not_configured" };
  }
  if (!closebossBase) {
    return { sent: false, reason: "closeboss_url_missing" };
  }

  const openUrl = `${closebossBase}/dashboard/support?conversation=${encodeURIComponent(params.conversationPublicId)}`;

  const body = [
    `PropertyTools: ${params.customerName} started a chat.`,
    `Open: ${openUrl}`,
  ].join(" ");

  try {
    const client = twilio(sid, token);
    await client.messages.create({
      from,
      to: params.toPhoneE164,
      body: body.slice(0, 1600),
    });
    return { sent: true };
  } catch (e) {
    console.error("[notifyAssignedAgentChatSms]", e);
    return { sent: false, reason: e instanceof Error ? e.message : "twilio_error" };
  }
}
