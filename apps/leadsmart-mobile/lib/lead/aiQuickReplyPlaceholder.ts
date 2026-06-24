import { Alert } from "react-native";

export type AiQuickReplyChannel = "sms" | "email" | "choose";

/**
 * Placeholder for the future AI SMS/email assistant.
 * Replace this with navigation to an assistant screen or an API-backed flow.
 */
export function presentAiQuickReplyPlaceholder(leadId: string, channel: AiQuickReplyChannel = "choose"): void {
  const scope =
    channel === "sms"
      ? "SMS"
      : channel === "email"
        ? "email"
        : "SMS and email";
  Alert.alert(
    "AI quick reply",
    `Assistant for ${scope} is not available yet. This action will open suggested replies powered by RealtorBoss.\n\nLead: ${leadId}`,
    [{ text: "OK" }],
  );
}
