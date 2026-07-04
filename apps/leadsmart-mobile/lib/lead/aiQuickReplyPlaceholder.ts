import { Alert } from "react-native";

export type AiQuickReplyChannel = "sms" | "email" | "choose";

/**
 * Placeholder for the future AI SMS/email assistant.
 * Replace this with navigation to an assistant screen or an API-backed flow.
 *
 * NOTE: never surface `leadId` (a raw UUID) in the copy — it means nothing to
 * an agent and reads as a bug. It's kept in the signature for the real flow
 * (which will draft a reply for that contact). Pass `leadName` to personalize
 * the message; when omitted we show a clean, ID-free notice.
 */
export function presentAiQuickReplyPlaceholder(
  _leadId: string,
  channel: AiQuickReplyChannel = "choose",
  leadName?: string | null,
): void {
  const scope =
    channel === "sms"
      ? "SMS"
      : channel === "email"
        ? "email"
        : "SMS and email";
  const who = leadName?.trim() ? ` for ${leadName.trim()}` : "";
  Alert.alert(
    "AI quick reply",
    `Suggested ${scope} replies${who} are coming soon. This action will draft messages for you, powered by RealtyBoss.`,
    [{ text: "OK" }],
  );
}
