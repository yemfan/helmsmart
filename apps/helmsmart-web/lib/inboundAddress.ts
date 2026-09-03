/**
 * The address an organization forwards its mailbox to, so replies land in the
 * Inbox — or `null` when inbound email is not usable. The null is the point.
 *
 * `INBOUND_EMAIL_DOMAIN` must be a BARE DOMAIN, e.g. `inbox.helmsmart.ai`.
 * Production had it set to `inbox@helmsmart.ai`, and the settings page built
 * the address by interpolation, so it rendered:
 *
 *     ken-1788408836607@inbox@helmsmart.ai
 *
 * Two `@`. No mail server accepts that, so an owner who followed the on-screen
 * instructions would paste it into Gmail's forwarding setup and simply be told
 * no. The quieter half is worse: `app/api/resend/inbound/route.ts` finds the
 * recipient whose address ends with `"@" + INBOUND_EMAIL_DOMAIN`, and no real
 * address ends in `@inbox@helmsmart.ai`, so the match failed, the slug was
 * null, and the handler returned 200 OK having stored nothing. Every inbound
 * email was accepted and dropped, and Resend saw success.
 *
 * Hence the validation. A misconfigured domain now shows nothing at all, which
 * is honest, rather than an address that looks copy-pasteable and cannot work.
 */

/** A bare hostname: no scheme, no `@`, no path, at least one dot. */
function isBareDomain(value: string): boolean {
  return /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/.test(value);
}

export function inboundAddressFor(
  slug: string | null | undefined,
  domain: string | null | undefined = process.env.INBOUND_EMAIL_DOMAIN,
): string | null {
  const localPart = (slug ?? "").trim().toLowerCase();
  const host = (domain ?? "").trim().toLowerCase();

  if (!localPart || !host) return null;
  if (!isBareDomain(host)) return null;
  // Org slugs are generated, but they end up left of an `@` — so hold them to
  // what a local part may actually contain rather than trusting the generator.
  if (!/^[a-z0-9][a-z0-9._-]*$/.test(localPart)) return null;

  return `${localPart}@${host}`;
}
