/**
 * May this reply be addressed to this email address?
 *
 * The inbox holds the selected thread and the loaded contact in two separate
 * pieces of state. `selectedLead` is set the instant a thread is clicked;
 * `lead` — which carries the email address — only arrives when the thread
 * fetch returns. Assigning `lead` solely on success meant a failed fetch left
 * the PREVIOUS contact in place while the selection had already moved on, and
 * the email reply path reads its address off `lead`.
 *
 * So: open Jordan, open Marcus, Marcus's thread fetch fails, type a reply,
 * send — and it goes to Jordan, under the agent's own name, in a thread the
 * agent believes is Marcus's. Nothing on screen contradicts it.
 *
 * The SMS path cannot drift this way because it addresses by `leadId`. This
 * function gives the email path the same guarantee: the loaded contact must be
 * the selected one, and must actually have an address.
 *
 * Pure and free of `server-only` so the rule can be tested directly.
 */

export type ReplyLead = { id: string; email: string | null } | null;

export function canEmailThread(lead: ReplyLead, selectedLeadId: string | null): boolean {
  if (!lead || !selectedLeadId) return false;
  // Identity first: an address is only usable once we know whose it is.
  if (lead.id !== selectedLeadId) return false;
  return typeof lead.email === "string" && lead.email.trim().length > 0;
}
