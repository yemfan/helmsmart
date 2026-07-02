-- Add the Twilio delivery-error columns the SMS status callback writes.
--
-- The status callback (apps/leadsmartai/app/api/twilio/sms/status/route.ts)
-- updates sms_messages with { twilio_status, delivery_error_code,
-- delivery_error_message }. The migration that was meant to add these
-- (20260453000000_sms_messages_twilio_delivery.sql) has a malformed
-- timestamp ("day 53") and never landed on the shared DB, so those two
-- columns were missing in production. PostgREST rejects the ENTIRE update
-- when it references a non-existent column, so every delivery callback
-- silently no-op'd and outbound rows were stranded at twilio_status =
-- 'queued'. Adding the columns lets the status transition (queued -> sent
-- -> delivered/failed) persist again. Idempotent.

alter table if exists public.sms_messages
  add column if not exists delivery_error_code text null,
  add column if not exists delivery_error_message text null;
