-- RealtorBoss — Boss Assistant ACTION REGISTRY (one command → real artifacts).
--
-- The Boss planner now picks a concrete ACTION per task (e.g. generate_cma,
-- generate_seller_presentation) and extracts its parameters. When a required
-- parameter is missing, the task parks as 'needs_input' with a follow-up
-- question; the Realtor answers on the Boss card and the action runs. Actions
-- that produce a deliverable park as 'completed' with a link to the artifact.

alter table public.boss_instruction_tasks
  drop constraint if exists boss_instruction_tasks_status_check;
alter table public.boss_instruction_tasks
  add constraint boss_instruction_tasks_status_check check (
    status in (
      'assigned', 'needs_review', 'needs_input', 'awaiting_approval',
      'sent', 'completed', 'done', 'dismissed', 'failed'
    )
  );

alter table public.boss_instruction_tasks
  add column if not exists action_type text,
  add column if not exists params_json jsonb not null default '{}'::jsonb,
  add column if not exists follow_up_question text,
  add column if not exists artifact_type text,
  add column if not exists artifact_url text;

comment on column public.boss_instruction_tasks.action_type is
  'Registry action the Boss planner chose (generate_cma, generate_seller_presentation, …). Null = no executable action; message drafts use the draft_* columns.';
comment on column public.boss_instruction_tasks.params_json is
  'Extracted action parameters, e.g. {"address":"123 Main St"}. Missing required params → status needs_input + follow_up_question.';
comment on column public.boss_instruction_tasks.follow_up_question is
  'The question the Boss asks the Realtor when a required action param is missing (answered on the Boss card).';
comment on column public.boss_instruction_tasks.artifact_url is
  'In-app link to the deliverable an action produced (e.g. /dashboard/cma/<id>) when status=completed.';
