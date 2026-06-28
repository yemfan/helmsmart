-- Per-assistant avatar. Each AI assistant already has an editable display
-- `name` (20260637000000); this adds the avatar so a user can assign + change
-- both — mirroring HelmSmart's AI-employee avatar pattern. Stores a persona id
-- (persona-01..persona-20) from the shared /public/avatars set; null falls back
-- to a deterministic role-fit default in code (lib/realtorboss/avatars.ts).

alter table public.ai_assistants
  add column if not exists avatar_id text;

comment on column public.ai_assistants.avatar_id is
  'Avatar persona id (persona-01..persona-20). Null = deterministic role-fit default.';
