-- Boss instruction tasks: add the 'scheduled' status.
--
-- When a channel is on autopilot but the send lands inside the agent's quiet
-- hours (or Sunday-morning / Chinese-New-Year pause), the Boss no longer sends
-- immediately. Instead it queues the drafted message as a scheduled_actions row
-- for the next open time (drained by the existing outreach-scheduler cron) and
-- marks the task 'scheduled' — so a blocked autopilot message is deferred and
-- sent later, not silently parked.
alter table public.boss_instruction_tasks
  drop constraint if exists boss_instruction_tasks_status_check;
alter table public.boss_instruction_tasks
  add constraint boss_instruction_tasks_status_check check (
    status in (
      'assigned', 'needs_review', 'needs_input', 'awaiting_approval',
      'scheduled', 'sent', 'completed', 'done', 'dismissed', 'failed'
    )
  );
