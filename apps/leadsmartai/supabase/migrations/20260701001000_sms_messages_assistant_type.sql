-- Attribute outbound texts to the AI assistant that sent them.
--
-- The lead timeline could only label outbound SMS generically ("AI team
-- texted") because sms_messages recorded direction but not *which* assistant
-- sent it — while assistant_activities (the ⚡ rows) knew the assistant. This
-- column closes that gap for texts sent from here on. Historical rows stay null
-- (the sender was never recorded) and fall back to a generic label.

alter table public.sms_messages add column if not exists assistant_type text;

comment on column public.sms_messages.assistant_type is
  'Which AI assistant sent an outbound text (receptionist|sales_assistant|transaction_assistant|accountant|boss_assistant). Null for inbound and for agent/system sends.';
