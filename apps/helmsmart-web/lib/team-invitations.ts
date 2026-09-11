/**
 * Who a team invitation is for.
 *
 * The link in an invitation email is not the credential — anyone the email is
 * forwarded to, or who sees it in a shared inbox or a screenshot, holds the
 * same link. The credential is the mailbox it was sent to. So an invitation is
 * accepted only by the account whose email is the one the owner typed, compared
 * the way email providers compare addresses: case-insensitively, ignoring
 * stray whitespace.
 *
 * Plain module, no directive: `/join/[token]` uses it to decide what to show,
 * and `acceptInvitation` uses it to decide what to allow. A "use server" file
 * may only export async functions.
 */
function normalizeEmail(email: string | null | undefined): string {
  return (email ?? "").trim().toLowerCase();
}

export function isInvitee(invitedEmail: string, userEmail: string | null | undefined): boolean {
  const invited = normalizeEmail(invitedEmail);
  return invited !== "" && invited === normalizeEmail(userEmail);
}
