-- RealtorBoss — Boss Assistant: ask one clarifying question instead of
-- emitting a no-op "Review note" task for vague/non-actionable instructions.
--
-- Before: a non-actionable instruction (a greeting, a vague "review that
-- transaction" with no specifics) was turned into a "Review note" task routed
-- to the Realtor — which created a boss_instruction_tasks card AND a junk
-- crm_tasks row. Repeated vague commands stacked identical no-op cards.
--
-- After: the Boss Assistant stores ONE short clarifying question here, creates
-- NO tasks, and the Boss dashboard renders the question inline. The Realtor
-- re-sends a more specific instruction.

alter table public.boss_instructions
  add column if not exists clarification text;

comment on column public.boss_instructions.clarification is
  'When the Realtor''s instruction is too vague/non-actionable to route, the Boss Assistant stores ONE short clarifying question here instead of emitting a no-op "Review note" task. Mutually exclusive with routed boss_instruction_tasks.';
