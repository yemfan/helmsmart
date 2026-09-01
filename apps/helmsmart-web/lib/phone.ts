// Phone-number normalization moved to the shared @repo/voice package (used by
// every app that runs the voice agent). Re-exported here so existing
// `@/lib/phone` imports keep working.
export * from "@repo/voice/phone";

/**
 * Format a US number for SPEECH, e.g. "+16267557917" -> "6 2 6, 7 5 5, 7 9 1 7".
 *
 * Only ever read aloud. The written form "(626) 755-7917" is spoken by TTS as a
 * quantity — "six hundred twenty-six, seven hundred fifty-five..." — which is
 * unusable as a phone number, and the receptionist reads the caller's number
 * back to confirm it. Spaced digits force digit-by-digit; the commas give the
 * grouping pauses a person would make.
 *
 * Falls back to the raw input when it isn't a 10-digit US number, so an
 * international caller is never mangled into something wrong.
 */
export function formatPhoneForSpeech(e164: string): string {
  const raw = (e164 || "").trim();
  const digits = raw.replace(/\D/g, "");
  // Drop the US country code, but ONLY when what remains is a real 10-digit US
  // number. Taking the last ten digits unconditionally turns +44 20 7183 8750
  // into "2071838750", and the receptionist then reads that wrong number back to
  // the caller as if it were theirs.
  const us =
    digits.length === 10
      ? digits
      : digits.length === 11 && digits.startsWith("1")
        ? digits.slice(1)
        : "";
  if (!us) return raw;
  const spell = (chunk: string) => chunk.split("").join(" ");
  return `${spell(us.slice(0, 3))}, ${spell(us.slice(3, 6))}, ${spell(us.slice(6))}`;
}
