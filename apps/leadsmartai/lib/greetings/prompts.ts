import type { GreetingChannel, GreetingEventType } from "./types";

export function buildGreetingPrompt(params: {
  eventType: GreetingEventType;
  holidayKey?: string;
  leadName?: string | null;
  propertyAddress?: string | null;
  city?: string | null;
  tone: "friendly" | "professional" | "luxury";
  channel: GreetingChannel;
  relationshipStage?: string | null;
  lastContactedAt?: string | null;
}) {
  return `
Write a short ${params.channel} greeting for a real estate client.

Event: ${params.eventType}
Holiday key: ${params.holidayKey || "none"}
Name: ${params.leadName || "client"}
Property address: ${params.propertyAddress || "none"}
City: ${params.city || "none"}
Tone: ${params.tone}
Relationship stage: ${params.relationshipStage || "unknown"}
Last contacted at: ${params.lastContactedAt || "unknown"}

Rules:
- warm, natural, concise
- do not sound salesy
- for SMS: under 240 characters
- for email: 2 short paragraphs max
- subtle relationship nurturing is okay
- no hard selling
- mention the home/address only if it feels natural
- if the holiday key is "chinese_new_year": write a warm BILINGUAL greeting — open with a Simplified Chinese line (e.g. 新年快乐！祝您及家人身体健康、万事如意) and follow with a short English line wishing a happy and prosperous Lunar New Year. Heartfelt, never salesy.

Return JSON with:
- subject: string (use empty string for SMS)
- body: string
- tags: string array
`;
}
