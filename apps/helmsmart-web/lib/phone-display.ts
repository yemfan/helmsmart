/**
 * A phone number as a person reads it on screen: "+14155550121" -> "(415) 555-0121".
 *
 * Pure and directive-free, so both the AI panel (a client component) and the
 * dashboard's AI activity feed (a server component) can import it. A number
 * that is not a 10-digit US one (or +1 and 10 digits) comes back as it was
 * given — an international number reformatted into US shape would be wrong,
 * and wrong is worse than untouched.
 */
export function formatPhoneDisplay(input: string | null | undefined): string {
  const raw = (input ?? "").trim();
  if (!raw) return "";
  const digits = raw.replace(/\D/g, "");
  const us =
    digits.length === 10 ? digits : digits.length === 11 && digits.startsWith("1") ? digits.slice(1) : null;
  if (!us) return raw;
  return `(${us.slice(0, 3)}) ${us.slice(3, 6)}-${us.slice(6)}`;
}
