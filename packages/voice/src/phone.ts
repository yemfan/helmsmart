/**
 * Phone-number normalization to E.164.
 *
 * The receptionist resolves which tenant a call belongs to by matching the
 * dialed number. A fat-fingered number (e.g. a dropped digit) silently breaks
 * that match and the voice agent can't book anything — so the number must be
 * validated + normalized before it's stored, not taken as free text.
 *
 * Shared by all apps that use the voice agent (smbai, leadsmartai, …).
 */

export type PhoneResult = { ok: true; value: string } | { ok: false; error: string };

const E164_HINT = "Use E.164 format — a US number as 10 digits or +1 then 10 digits (e.g. +16265551234).";

/**
 * Normalize loose user input ("(626) 669-4566", "626-669-4566", "+1 626 669 4566")
 * to strict E.164 ("+16266694566"). US numbers may omit the country code; any
 * other country must be entered with a leading "+". Rejects anything that isn't
 * a plausible 10-digit US number or a 11–15 digit international number — which
 * is what catches a dropped/extra digit before it reaches the database.
 */
export function normalizePhoneE164(input: string): PhoneResult {
  const raw = (input || "").trim();
  if (!raw) return { ok: false, error: "Enter a phone number." };

  const hadPlus = raw.startsWith("+");
  const digits = raw.replace(/\D/g, "");

  // US, no country code: exactly 10 digits → +1XXXXXXXXXX
  if (!hadPlus && digits.length === 10) return { ok: true, value: `+1${digits}` };

  // US with country code: 1 + 10 digits → +1XXXXXXXXXX
  if (digits.length === 11 && digits.startsWith("1")) return { ok: true, value: `+${digits}` };

  // International: must be entered with "+", 11–15 digits per E.164.
  if (hadPlus && digits.length >= 11 && digits.length <= 15) return { ok: true, value: `+${digits}` };

  return { ok: false, error: `That doesn't look like a valid phone number. ${E164_HINT}` };
}

/**
 * The last ten digits of a number, for MATCHING — "" when there aren't ten.
 *
 * The same person's number is stored in several shapes across a tenant's data:
 * "+16267557917" from caller ID, "(626) 755-7917" typed by hand, "626-755-7917"
 * from an import. An exact string comparison finds none of them, so every lookup
 * that has to recognise a caller compares this instead.
 *
 * Deliberately NOT the same rule as formatPhoneForSpeech below: truncating a
 * long international number is fine for a match key (it is stable both sides of
 * the comparison) and wrong for something read aloud.
 */
export function phoneLast10(input: string | null | undefined): string {
  const digits = (input ?? "").replace(/\D/g, "");
  return digits.length >= 10 ? digits.slice(-10) : "";
}

/**
 * Format a US number for SPEECH, e.g. "+16267557917" -> "6 2 6, 7 5 5, 7 9 1 7".
 *
 * Only ever read aloud. The written form "(626) 755-7917" is spoken by TTS as a
 * quantity — "six hundred twenty-six, seven hundred fifty-five..." — which is
 * unusable as a phone number, and the receptionist reads the caller's number
 * back to confirm it. Spaced digits force digit-by-digit; the commas give the
 * grouping pauses a person would make.
 *
 * Strips the US country code only when what remains is really a 10-digit US
 * number. Taking the last ten digits unconditionally turns +44 20 7183 8750 into
 * "2071838750", and the receptionist then reads that wrong number back to the
 * caller as if it were theirs — so anything else is returned untouched.
 */
export function formatPhoneForSpeech(input: string): string {
  const raw = (input || "").trim();
  const digits = raw.replace(/\D/g, "");
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
