/**
 * How an outbound SMS identifies its sender.
 *
 * US A2P 10DLC compliance is enforced at the Messaging Service level: sending by
 * bare `from` number can be filtered as "unregistered" (error 30034) even when
 * the number sits in a registered campaign. When a Messaging Service SID is
 * configured we send through it so Twilio applies the campaign; otherwise we
 * fall back to the raw number.
 *
 * This matters most where the sending number is NOT the approved one. A tenant
 * can hold several numbers with only one cleared for messaging, the rest used
 * for voice — and the receptionist answers on a voice number, then tries to text
 * the booking confirmation from it. Sending by bare `from` there is filtered,
 * the error is swallowed as best-effort, and the caller simply never gets the
 * confirmation they were promised on the call.
 *
 * A plain module on purpose: `lib/actions/messages.ts` carries the same logic
 * but is "use server", and importing a helper out of a server-action file blows
 * up at runtime.
 */
export type TwilioSender = { messagingServiceSid: string } | { from: string };

/**
 * Spread into `client.messages.create({ ...twilioSender(n), to, body })`.
 * Returns null when neither a Messaging Service nor a usable number exists, so
 * the caller can skip the send instead of throwing inside a best-effort path.
 */
export function twilioSender(fromNumber: string | null | undefined): TwilioSender | null {
  const messagingServiceSid = process.env.TWILIO_MESSAGING_SERVICE_SID?.trim();
  if (messagingServiceSid) return { messagingServiceSid };
  const from = (fromNumber || process.env.TWILIO_FROM_NUMBER || "").trim();
  return from ? { from } : null;
}
