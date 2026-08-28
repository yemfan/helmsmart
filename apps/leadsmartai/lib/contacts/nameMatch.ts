/**
 * Name comparison for disambiguating contacts that share a phone number.
 *
 * Its own module because missed-call/service.ts is `server-only` and cannot be
 * imported from a test — and this is the half worth testing, since the failure
 * mode is silent: the wrong person's record, greeted by the right name.
 */

/**
 * Strip everything that is not a letter, digit or CJK character, and lower-case
 * the rest.
 *
 * Names arrive punctuated and spaced in ways that mean nothing: "Ye, Michael",
 * "叶 Michael", "叶Michael" and "michael ye" are the same person to a human and
 * four different strings to a database. Comparing what is left after the noise
 * is removed is more forgiving than any amount of trimming.
 */
export function normalizeContactName(v: string | null | undefined): string {
  return (v ?? "").toLowerCase().replace(/[^a-z0-9一-鿿]+/g, "");
}

/**
 * Does this contact answer to the name the caller gave?
 *
 * Matches on the full name OR the first name, because callers give one or the
 * other — "it's Michael" should find Michael Ye. Deliberately not fuzzy beyond
 * that: this only ever CHOOSES between rows whose phone already matched, so a
 * loose rule here picks the wrong record rather than merely failing to find one.
 */
export function contactMatchesName(
  candidate: { name?: string | null; first_name?: string | null; last_name?: string | null },
  nameHint: string | null | undefined,
): boolean {
  const wanted = normalizeContactName(nameHint);
  if (!wanted) return false;

  const full = normalizeContactName(
    candidate.first_name || candidate.last_name
      ? `${candidate.first_name ?? ""} ${candidate.last_name ?? ""}`
      : (candidate.name ?? ""),
  );
  if (full && full === wanted) return true;

  const first = normalizeContactName(
    candidate.first_name ?? (candidate.name ?? "").split(/\s+/)[0],
  );
  return !!first && first === wanted;
}
