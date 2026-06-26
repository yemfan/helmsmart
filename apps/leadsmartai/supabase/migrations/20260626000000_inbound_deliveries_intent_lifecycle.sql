-- Widen inbound_email_deliveries.intent CHECK to cover the transaction-
-- lifecycle intents added in code (PR #716) but never reflected in the DB.
--
-- The original constraint (20260615000000_inbound_email_deliveries.sql) only
-- allowed offer_received / listing_signed / showing_requested / unknown. The
-- inbound classifier, however, also emits inspection, appraisal, financing,
-- title_escrow, closing, and transaction_doc. Any forwarded transaction email
-- that classified as one of those failed to insert:
--   new row for relation "inbound_email_deliveries" violates check constraint
--   "inbound_email_deliveries_intent_check"
-- so the delivery + review task were silently dropped (webhook still 200s).
--
-- Keep this list in sync with InboundIntent in
-- apps/leadsmartai/lib/inbound/intent.ts.

alter table public.inbound_email_deliveries
  drop constraint if exists inbound_email_deliveries_intent_check;

alter table public.inbound_email_deliveries
  add constraint inbound_email_deliveries_intent_check
  check (
    intent in (
      'offer_received',
      'listing_signed',
      'showing_requested',
      'inspection',
      'appraisal',
      'financing',
      'title_escrow',
      'closing',
      'transaction_doc',
      'unknown'
    )
  );
