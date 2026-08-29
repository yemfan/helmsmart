/**
 * Which number should we text this contact on, in the shape Twilio wants?
 *
 * `contacts.phone` is now the single phone column. It used to be two — `phone`
 * and `phone_number` — carrying the same fact with nothing keeping them in
 * step, so which one a row had filled in depended on which screen or import
 * created it. Code that read one column decided a quarter of the book had no
 * number: the draft sender failed messages for "no phone number" while a
 * perfectly good +1626555xxxx sat in the column it did not read. That column is
 * gone; this exists for the part of the problem that outlived it.
 *
 * A number is stored in whichever shape the screen that captured it used —
 * "(626) 555-0166" from the contact form, "+16265550166" from an import — and
 * Twilio is happiest with one of them.
 *
 * Pure, so it can be tested without a database or a provider.
 */

export type ContactPhoneFields = {
  phone?: string | null;
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
  const compact = trimmed.replace(/[\s()-]/g, "");
  if (/^\+\d{7,15}$/.test(compact)) return compact;
  const national = usNationalDigits(trimmed);
  return national ? `+1${national}` : trimmed;
}

/** The number to text, or null if this contact genuinely has none. */
export function contactSmsNumber(contact: ContactPhoneFields | null | undefined): string | null {
  const value = (contact?.phone ?? "").trim();
  if (!value) return null;
  return toE164(value) || null;
}
