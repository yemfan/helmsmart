/**
 * Which number should we text this contact on?
 *
 * `contacts` carries the same fact in two columns — `phone` and `phone_number`
 * — and different parts of the app have filled in different ones. Today 19
 * contacts have only `phone`, 8 have only `phone_number`. Any code that reads
 * one column decides a quarter of the book is unreachable, and says so with a
 * straight face: the draft sender failed messages to Sofia Marin and David Kim
 * for "no phone number" while `+16265550166` sat in the column it did not read.
 *
 * Reading both is the fix that matches the data as it actually is. Which
 * column wins barely matters — what matters is that neither is ignored.
 *
 * Also normalises to E.164, because a number is stored in whichever shape the
 * screen that captured it used: "(626) 555-0166" from the contact form,
 * "+16265550166" from an import. Twilio is happiest with one of those.
 *
 * Pure, so it can be tested without a database or a provider.
 */

export type ContactPhoneFields = {
  phone?: string | null;
  phone_number?: string | null;
};

/** US national digits, tolerating a leading 1 / +1. Empty when it is not one. */
function usNationalDigits(input: string): string {
  let d = input.replace(/\D/g, "");
  if (d.length === 11 && d.startsWith("1")) d = d.slice(1);
  return d.length === 10 ? d : "";
}

/**
 * E.164 where we can recognise the number, otherwise the value as given.
 *
 * A number we cannot parse is passed through rather than dropped: an
 * international contact is better served by letting the provider judge it than
 * by us deciding it does not exist.
 */
export function toE164(input: string): string {
  const trimmed = input.trim();
  if (!trimmed) return "";
  if (/^\+\d{7,15}$/.test(trimmed.replace(/[\s()-]/g, ""))) {
    return trimmed.replace(/[\s()-]/g, "");
  }
  const national = usNationalDigits(trimmed);
  return national ? `+1${national}` : trimmed;
}

/**
 * The number to text, or null if this contact genuinely has none.
 *
 * `phone` first only because it is the column the contact form writes, so it is
 * the one a person most recently confirmed by hand.
 */
export function contactSmsNumber(contact: ContactPhoneFields | null | undefined): string | null {
  const candidates = [contact?.phone, contact?.phone_number];
  for (const candidate of candidates) {
    const value = (candidate ?? "").trim();
    if (!value) continue;
    const e164 = toE164(value);
    if (e164) return e164;
  }
  return null;
}
