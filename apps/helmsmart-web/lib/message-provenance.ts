/**
 * Who — or what — sent an outbound `messages` row. Stored in `messages.sent_by`
 * (migration 20260912000000_messages_sent_by.sql); inbound rows leave it null.
 *
 * Before this column the inbox could not tell a person's reply from Auto
 * Pilot's, or from an automatic invoice reminder, and signed all of them "You:".
 *
 * The set is exactly the writers of outbound rows, surveyed 2026-09-10:
 *
 *   person            someone on the team pressed Send — an inbox reply, a new
 *                     message, the AI panel's Send on a draft, sending an invoice
 *   auto_pilot        Auto Pilot sent it without a person: the AI panel's
 *                     automatic send, and the AI texting receptionist replying
 *                     to an Auto Pilot client or a missed-call lead
 *   auto_reply        the business's canned auto-reply (SMS and email), and the
 *                     automatic replies in the text-CANCEL appointment flow
 *   missed_call_text  the text sent to a caller whose call went unanswered
 *   reminder          appointment reminder texts and invoice payment reminders
 *   receptionist      the AI receptionist confirming a booking it made (voice or
 *                     text), and the booking alert it texts the business
 *
 * Campaigns and automation rules send too, but write no `messages` rows — they
 * are recorded in their own tables — so they are not values here. Adding one is
 * a one-line change to this list AND to the CHECK in a new migration; the test
 * in `message-provenance.test.ts` fails if the two disagree.
 */
export const MESSAGE_SENDERS = [
  "person",
  "auto_pilot",
  "auto_reply",
  "missed_call_text",
  "reminder",
  "receptionist",
] as const;

export type MessageSender = (typeof MESSAGE_SENDERS)[number];
