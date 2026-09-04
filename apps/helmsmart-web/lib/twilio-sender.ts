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

  /*
   * TWILIO_FROM_NUMBER wins over the number it was handed.
   *
   * The number passed in is the org's `twilio_number` — the line the
   * receptionist ANSWERS on. That it can receive says nothing about whether it
   * may send: it has to belong to the Twilio account these credentials open,
   * and be registered to an A2P campaign. `+16268888685` satisfied neither, so
   * every text from it came back 30034 (unregistered) while the account's own
   * approved sender sat unused in the env.
   *
   * So when an account-level sender is configured, it is the answer.
   * TWILIO_FROM_NUMBER is set deliberately, per deployment, by someone who
   * knows which number that account may send from; an org's receiving line is
   * just whatever number happens to be pointed at the product.
   *
   * The per-org number remains the fallback, which is what a future
   * one-number-per-tenant setup wants — but it stops being a way to silently
   * send from a number the account does not own.
   */
  // Trim each candidate BEFORE choosing, not after. "   " is truthy, so a
  // whitespace-only env var would win the `||` and then trim to nothing —
  // a stray blank pasted into Vercel silently stopping every message, which is
  // the same invisible failure this function exists to prevent.
  const envFrom = (process.env.TWILIO_FROM_NUMBER || "").trim();
  const orgFrom = (fromNumber || "").trim();
  const from = envFrom || orgFrom;
  return from ? { from } : null;
}
