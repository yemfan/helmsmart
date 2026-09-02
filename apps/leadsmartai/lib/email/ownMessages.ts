/**
 * CloseBoss shows CloseBoss's own conversations.
 *
 * `contacts` and `email_messages` are shared with PropertyTools AI, which
 * emails the same people from its own brand and signs off "— PropertyTools AI".
 * Those are real messages and the row belongs in the table — it is how we
 * answer what a contact has actually received, and it is what suppression and
 * attribution read. But an agent opening the CloseBoss Inbox is looking at
 * THEIR conversation, and a message signed by another product reads as a bug or
 * a leak, not as context.
 *
 * So the data stays and the view filters. That is precisely why `source` was
 * added as a column rather than the messages being split into a second table:
 * one thread per contact, and each reader decides what it is entitled to show.
 *
 * NULL PASSES ON PURPOSE. Rows written before `source` existed have none, and
 * they were CloseBoss's — excluding them would blank out history to fix a
 * labelling problem.
 */

/** Apps whose messages CloseBoss must not render as its own. */
export const FOREIGN_SOURCES = ["propertytoolsai"] as const;

/**
 * A PostgREST `.or()` filter keeping only this app's messages.
 *
 * Written as `source.is.null,source.eq.closeboss` rather than
 * `source.neq.propertytoolsai` because in SQL a NULL never satisfies `<>` —
 * `.neq()` would silently drop every pre-column row along with the foreign
 * ones.
 */
export const OWN_MESSAGES_FILTER = "source.is.null,source.eq.closeboss";

/** Same rule for rows already in memory. */
export function isOwnMessage(row: { source?: string | null } | null | undefined): boolean {
  const s = row?.source ?? null;
  if (s === null) return true;
  return !(FOREIGN_SOURCES as readonly string[]).includes(s);
}
