// Phone normalization, match keys, and speech formatting all live in the shared
// @repo/voice package (used by every app that runs the voice agent). Re-exported
// here so existing `@/lib/phone` imports keep working.
export * from "@repo/voice/phone";

import { normalizePhoneE164, phoneLast10 } from "@repo/voice/phone";

/**
 * The shapes one number is commonly stored in, for an exact `in (...)` filter —
 * so a client typed in by hand as "(415) 555-0143" is found for a caller ID of
 * "+14155550143", and an unsubscribe recorded as "415 555 0143" still holds.
 *
 * ONE list for every lookup that has to recognise a person by phone: the AI
 * receptionist, the /voice call log, and consent. It used to be two lists that
 * disagreed on which shapes counted, so the same client could be found by one
 * screen and missed by another.
 *
 * Every variant shares the input's last ten digits, so anything it finds is the
 * same number by phoneLast10. A number with fewer than ten digits is passed
 * through as it was given, and an empty one matches nothing.
 */
export function phoneMatchVariants(input: string | null | undefined): string[] {
  const raw = (input ?? "").trim();
  if (!raw) return [];
  const out = new Set<string>([raw]);
  const e164 = normalizePhoneE164(raw);
  if (e164.ok) out.add(e164.value);

  const d = phoneLast10(raw);
  if (d) {
    const [a, b, c] = [d.slice(0, 3), d.slice(3, 6), d.slice(6)];
    for (const v of [
      d,
      `1${d}`,
      `+1${d}`,
      `+1 ${d}`,
      `(${a}) ${b}-${c}`,
      `(${a})${b}-${c}`,
      `${a}-${b}-${c}`,
      `${a}.${b}.${c}`,
      `${a} ${b} ${c}`,
      `1-${a}-${b}-${c}`,
      `+1 (${a}) ${b}-${c}`,
      `+1 ${a}-${b}-${c}`,
      `+1 ${a} ${b} ${c}`,
      `+1-${a}-${b}-${c}`,
    ]) {
      out.add(v);
    }
  }
  return [...out];
}
